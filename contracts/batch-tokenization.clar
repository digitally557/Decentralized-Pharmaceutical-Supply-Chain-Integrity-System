;; Batch Tokenization & Manufacturer Registration Contract
;; This contract manages pharmaceutical batch NFTs and manufacturer licensing

;; ===================================
;; Constants and Error Codes
;; ===================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u401))
(define-constant ERR-NOT-FOUND (err u404))
(define-constant ERR-ALREADY-EXISTS (err u409))
(define-constant ERR-INVALID-INPUT (err u400))
(define-constant ERR-MANUFACTURER-NOT-APPROVED (err u403))
(define-constant ERR-MANUFACTURER-REVOKED (err u402))
(define-constant ERR-BATCH-EXPIRED (err u410))

;; ===================================
;; Data Variables
;; ===================================

(define-data-var contract-uri (string-utf8 256) u"")
(define-data-var last-batch-id uint u0)

;; ===================================
;; Data Maps
;; ===================================

;; Regulator management
(define-map regulators principal bool)

;; Manufacturer data structure
(define-map manufacturers
  principal
  {
    name: (string-utf8 100),
    license-id: (string-utf8 50),
    approved: bool,
    approved-by: principal,
    approval-date: uint,
    revoked: bool,
    revoked-by: (optional principal),
    revocation-date: (optional uint)
  }
)

;; Batch NFT metadata
(define-map batch-metadata
  uint
  {
    drug-name: (string-utf8 100),
    batch-id: (string-utf8 50),
    manufacturer: principal,
    production-date: uint,
    expiry-date: uint,
    quantity: uint,
    created-at: uint,
    active: bool
  }
)

;; NFT ownership tracking
(define-map batch-owners uint principal)

;; Track batches by manufacturer
(define-map manufacturer-batches
  principal
  (list 1000 uint)
)

;; ===================================
;; NFT Trait Implementation
;; ===================================

(define-non-fungible-token pharmaceutical-batch uint)

(define-read-only (get-last-token-id)
  (ok (var-get last-batch-id))
)

(define-read-only (get-token-uri (token-id uint))
  (ok (some (var-get contract-uri)))
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? pharmaceutical-batch token-id))
)

;; ===================================
;; Regulator Management Functions
;; ===================================

(define-public (add-regulator (regulator principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (map-set regulators regulator true)
    (ok true)
  )
)

(define-public (remove-regulator (regulator principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (map-delete regulators regulator)
    (ok true)
  )
)

(define-read-only (is-regulator (user principal))
  (default-to false (map-get? regulators user))
)

;; ===================================
;; Manufacturer Management Functions
;; ===================================

(define-public (register-manufacturer 
  (manufacturer principal)
  (name (string-utf8 100))
  (license-id (string-utf8 50))
)
  (let
    (
      (existing-manufacturer (map-get? manufacturers manufacturer))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-none existing-manufacturer) ERR-ALREADY-EXISTS)
    (asserts! (> (len name) u0) ERR-INVALID-INPUT)
    (asserts! (> (len license-id) u0) ERR-INVALID-INPUT)
    
    (map-set manufacturers manufacturer {
      name: name,
      license-id: license-id,
      approved: false,
      approved-by: tx-sender,
      approval-date: stacks-block-height,
      revoked: false,
      revoked-by: none,
      revocation-date: none
    })
    
    (ok true)
  )
)

(define-public (approve-manufacturer (manufacturer principal))
  (let
    (
      (manufacturer-data (unwrap! (map-get? manufacturers manufacturer) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (not (get approved manufacturer-data)) ERR-ALREADY-EXISTS)
    (asserts! (not (get revoked manufacturer-data)) ERR-MANUFACTURER-REVOKED)
    
    (map-set manufacturers manufacturer (merge manufacturer-data {
      approved: true,
      approved-by: tx-sender,
      approval-date: stacks-block-height
    }))
    
    (ok true)
  )
)

(define-public (revoke-manufacturer (manufacturer principal) (reason (string-utf8 200)))
  (let
    (
      (manufacturer-data (unwrap! (map-get? manufacturers manufacturer) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (get approved manufacturer-data) ERR-MANUFACTURER-NOT-APPROVED)
    (asserts! (not (get revoked manufacturer-data)) ERR-ALREADY-EXISTS)
    
    (map-set manufacturers manufacturer (merge manufacturer-data {
      revoked: true,
      revoked-by: (some tx-sender),
      revocation-date: (some stacks-block-height)
    }))
    
    (print {
      event: "manufacturer-revoked",
      manufacturer: manufacturer,
      revoked-by: tx-sender,
      reason: reason,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-read-only (get-manufacturer-info (manufacturer principal))
  (map-get? manufacturers manufacturer)
)

(define-read-only (is-manufacturer-approved (manufacturer principal))
  (match (map-get? manufacturers manufacturer)
    manufacturer-data (and (get approved manufacturer-data) (not (get revoked manufacturer-data)))
    false
  )
)

;; ===================================
;; Batch NFT Functions
;; ===================================

(define-public (mint-batch
  (drug-name (string-utf8 100))
  (batch-id (string-utf8 50))
  (production-date uint)
  (expiry-date uint)
  (quantity uint)
)
  (let
    (
      (new-token-id (+ (var-get last-batch-id) u1))
      (manufacturer-batches-list (default-to (list) (map-get? manufacturer-batches tx-sender)))
    )
    ;; Validate manufacturer is approved
    (asserts! (is-manufacturer-approved tx-sender) ERR-MANUFACTURER-NOT-APPROVED)
    
    ;; Validate input parameters
    (asserts! (> (len drug-name) u0) ERR-INVALID-INPUT)
    (asserts! (> (len batch-id) u0) ERR-INVALID-INPUT)
    (asserts! (> expiry-date production-date) ERR-INVALID-INPUT)
    (asserts! (> quantity u0) ERR-INVALID-INPUT)
    
    ;; Check if batch is not expired at creation
    (asserts! (> expiry-date stacks-block-height) ERR-BATCH-EXPIRED)
    
    ;; Mint the NFT
    (try! (nft-mint? pharmaceutical-batch new-token-id tx-sender))
    
    ;; Store batch metadata
    (map-set batch-metadata new-token-id {
      drug-name: drug-name,
      batch-id: batch-id,
      manufacturer: tx-sender,
      production-date: production-date,
      expiry-date: expiry-date,
      quantity: quantity,
      created-at: stacks-block-height,
      active: true
    })
    
    ;; Update batch ownership
    (map-set batch-owners new-token-id tx-sender)
    
    ;; Add to manufacturer's batch list
    (map-set manufacturer-batches tx-sender (unwrap! (as-max-len? (append manufacturer-batches-list new-token-id) u1000) ERR-INVALID-INPUT))
    
    ;; Update last batch ID
    (var-set last-batch-id new-token-id)
    
    ;; Emit creation event
    (print {
      event: "batch-created",
      token-id: new-token-id,
      manufacturer: tx-sender,
      drug-name: drug-name,
      batch-id: batch-id,
      production-date: production-date,
      expiry-date: expiry-date,
      quantity: quantity,
      block-height: stacks-block-height
    })
    
    (ok new-token-id)
  )
)

(define-public (deactivate-batch (token-id uint))
  (let
    (
      (batch-data (unwrap! (map-get? batch-metadata token-id) ERR-NOT-FOUND))
      (current-owner (unwrap! (nft-get-owner? pharmaceutical-batch token-id) ERR-NOT-FOUND))
    )
    ;; Only regulators or the current owner can deactivate
    (asserts! (or (is-regulator tx-sender) (is-eq tx-sender current-owner)) ERR-UNAUTHORIZED)
    (asserts! (get active batch-data) ERR-INVALID-INPUT)
    
    (map-set batch-metadata token-id (merge batch-data { active: false }))
    
    (print {
      event: "batch-deactivated",
      token-id: token-id,
      deactivated-by: tx-sender,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

;; ===================================
;; Read-Only Functions
;; ===================================

(define-read-only (get-batch-info (token-id uint))
  (map-get? batch-metadata token-id)
)

(define-read-only (get-batch-owner (token-id uint))
  (map-get? batch-owners token-id)
)

(define-read-only (get-manufacturer-batches (manufacturer principal))
  (map-get? manufacturer-batches manufacturer)
)

(define-read-only (is-batch-valid (token-id uint))
  (match (map-get? batch-metadata token-id)
    batch-data (and 
      (get active batch-data) 
      (> (get expiry-date batch-data) stacks-block-height)
    )
    false
  )
)

;; Note: This is a simplified implementation for demonstration
;; In production, you would implement a more efficient search mechanism
;; such as maintaining a separate map from batch-id to token-id
(define-read-only (get-batch-by-batch-id (search-batch-id (string-utf8 50)))
  (let
    (
      (last-id (var-get last-batch-id))
    )
    ;; Check only the most recent batches for demonstration
    ;; In practice, implement a reverse lookup map
    (if (> last-id u0)
      (match (map-get? batch-metadata last-id)
        batch-data (if (is-eq (get batch-id batch-data) search-batch-id)
          (some { token-id: last-id, metadata: batch-data })
          (if (> last-id u1)
            (match (map-get? batch-metadata (- last-id u1))
              batch-data-prev (if (is-eq (get batch-id batch-data-prev) search-batch-id)
                (some { token-id: (- last-id u1), metadata: batch-data-prev })
                none
              )
              none
            )
            none
          )
        )
        none
      )
      none
    )
  )
)

;; ===================================
;; Transfer Function
;; ===================================

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-UNAUTHORIZED)
    (asserts! (is-batch-valid token-id) ERR-BATCH-EXPIRED)
    
    (try! (nft-transfer? pharmaceutical-batch token-id sender recipient))
    (map-set batch-owners token-id recipient)
    
    (print {
      event: "batch-transferred",
      token-id: token-id,
      from: sender,
      to: recipient,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

;; ===================================
;; Initialization
;; ===================================

;; Initialize contract owner as first regulator
(map-set regulators CONTRACT-OWNER true)