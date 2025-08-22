;; Supply Chain Transfer & Verification Contract
;; This contract manages secure transfers between licensed entities in the pharmaceutical supply chain

;; ===================================
;; Constants and Error Codes
;; ===================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u401))
(define-constant ERR-NOT-FOUND (err u404))
(define-constant ERR-ALREADY-EXISTS (err u409))
(define-constant ERR-INVALID-INPUT (err u400))
(define-constant ERR-NOT-LICENSED (err u403))
(define-constant ERR-LICENSE-REVOKED (err u402))
(define-constant ERR-BATCH-EXPIRED (err u410))
(define-constant ERR-BATCH-INACTIVE (err u411))
(define-constant ERR-INVALID-TRANSFER (err u412))
(define-constant ERR-COMPLIANCE-VIOLATION (err u413))

;; Entity Types
(define-constant ENTITY-MANUFACTURER u1)
(define-constant ENTITY-DISTRIBUTOR u2)
(define-constant ENTITY-PHARMACY u3)

;; ===================================
;; Data Variables
;; ===================================

(define-data-var batch-contract principal .batch-tokenization)
(define-data-var transfer-id uint u0)

;; ===================================
;; Data Maps
;; ===================================

;; Licensed entities in the supply chain
(define-map licensed-entities
  principal
  {
    entity-type: uint,
    name: (string-utf8 100),
    license-id: (string-utf8 50),
    approved: bool,
    approved-by: principal,
    approval-date: uint,
    revoked: bool,
    revoked-by: (optional principal),
    revocation-date: (optional uint),
    location: (string-utf8 200)
  }
)

;; Transfer records for audit trail
(define-map transfer-records
  uint
  {
    batch-token-id: uint,
    from-entity: principal,
    to-entity: principal,
    transfer-date: uint,
    from-entity-type: uint,
    to-entity-type: uint,
    compliance-checked: bool,
    authorized-by: principal,
    notes: (string-utf8 500)
  }
)

;; Track transfer history for each batch
(define-map batch-transfer-history
  uint
  (list 100 uint)
)

;; Current custody chain for each batch
(define-map batch-custody-chain
  uint
  (list 20 principal)
)

;; Compliance rules for transfers
(define-map transfer-compliance-rules
  { from-type: uint, to-type: uint }
  {
    allowed: bool,
    requires-authorization: bool,
    max-transfer-time: uint,
    additional-checks: (list 10 (string-utf8 50))
  }
)

;; Regulators who can approve entities and transfers
(define-map regulators principal bool)

;; Frozen batches (emergency stop)
(define-map frozen-batches uint bool)

;; Note: Trait imports would be used in production for cross-contract calls
;; (use-trait batch-nft-trait .batch-tokenization.sip009-nft-trait)

;; ===================================
;; Authorization Functions
;; ===================================

(define-public (add-regulator (regulator principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (map-set regulators regulator true)
    (ok true)
  )
)

(define-read-only (is-regulator (user principal))
  (default-to false (map-get? regulators user))
)

;; ===================================
;; Entity Management Functions
;; ===================================

(define-public (register-entity
  (entity principal)
  (entity-type uint)
  (name (string-utf8 100))
  (license-id (string-utf8 50))
  (location (string-utf8 200))
)
  (let
    (
      (existing-entity (map-get? licensed-entities entity))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-none existing-entity) ERR-ALREADY-EXISTS)
    (asserts! (and (>= entity-type u1) (<= entity-type u3)) ERR-INVALID-INPUT)
    (asserts! (> (len name) u0) ERR-INVALID-INPUT)
    (asserts! (> (len license-id) u0) ERR-INVALID-INPUT)
    
    (map-set licensed-entities entity {
      entity-type: entity-type,
      name: name,
      license-id: license-id,
      approved: false,
      approved-by: tx-sender,
      approval-date: stacks-block-height,
      revoked: false,
      revoked-by: none,
      revocation-date: none,
      location: location
    })
    
    (print {
      event: "entity-registered",
      entity: entity,
      entity-type: entity-type,
      name: name,
      registered-by: tx-sender,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (approve-entity (entity principal))
  (let
    (
      (entity-data (unwrap! (map-get? licensed-entities entity) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (not (get approved entity-data)) ERR-ALREADY-EXISTS)
    (asserts! (not (get revoked entity-data)) ERR-LICENSE-REVOKED)
    
    (map-set licensed-entities entity (merge entity-data {
      approved: true,
      approved-by: tx-sender,
      approval-date: stacks-block-height
    }))
    
    (print {
      event: "entity-approved",
      entity: entity,
      approved-by: tx-sender,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (revoke-entity (entity principal) (reason (string-utf8 200)))
  (let
    (
      (entity-data (unwrap! (map-get? licensed-entities entity) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (get approved entity-data) ERR-NOT-LICENSED)
    (asserts! (not (get revoked entity-data)) ERR-ALREADY-EXISTS)
    
    (map-set licensed-entities entity (merge entity-data {
      revoked: true,
      revoked-by: (some tx-sender),
      revocation-date: (some stacks-block-height)
    }))
    
    (print {
      event: "entity-revoked",
      entity: entity,
      revoked-by: tx-sender,
      reason: reason,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-read-only (is-entity-licensed (entity principal))
  (match (map-get? licensed-entities entity)
    entity-data (and (get approved entity-data) (not (get revoked entity-data)))
    false
  )
)

(define-read-only (get-entity-info (entity principal))
  (map-get? licensed-entities entity)
)

;; ===================================
;; Compliance Rules Management
;; ===================================

(define-public (set-transfer-rule
  (from-type uint)
  (to-type uint)
  (allowed bool)
  (requires-authorization bool)
  (max-transfer-time uint)
)
  (begin
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (and (>= from-type u1) (<= from-type u3)) ERR-INVALID-INPUT)
    (asserts! (and (>= to-type u1) (<= to-type u3)) ERR-INVALID-INPUT)
    
    (map-set transfer-compliance-rules
      { from-type: from-type, to-type: to-type }
      {
        allowed: allowed,
        requires-authorization: requires-authorization,
        max-transfer-time: max-transfer-time,
        additional-checks: (list)
      }
    )
    
    (ok true)
  )
)

(define-read-only (get-transfer-rule (from-type uint) (to-type uint))
  (map-get? transfer-compliance-rules { from-type: from-type, to-type: to-type })
)

;; ===================================
;; Batch Management Functions
;; ===================================

(define-public (freeze-batch (batch-token-id uint) (reason (string-utf8 200)))
  (begin
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    
    (map-set frozen-batches batch-token-id true)
    
    (print {
      event: "batch-frozen",
      batch-token-id: batch-token-id,
      frozen-by: tx-sender,
      reason: reason,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (unfreeze-batch (batch-token-id uint))
  (begin
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    
    (map-delete frozen-batches batch-token-id)
    
    (print {
      event: "batch-unfrozen",
      batch-token-id: batch-token-id,
      unfrozen-by: tx-sender,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-read-only (is-batch-frozen (batch-token-id uint))
  (default-to false (map-get? frozen-batches batch-token-id))
)

;; ===================================
;; Transfer Functions
;; ===================================

(define-private (validate-transfer
  (batch-token-id uint)
  (from-entity principal)
  (to-entity principal)
)
  (let
    (
      (from-entity-data (unwrap! (map-get? licensed-entities from-entity) ERR-NOT-LICENSED))
      (to-entity-data (unwrap! (map-get? licensed-entities to-entity) ERR-NOT-LICENSED))
      (from-type (get entity-type from-entity-data))
      (to-type (get entity-type to-entity-data))
      (transfer-rule (map-get? transfer-compliance-rules { from-type: from-type, to-type: to-type }))
      ;; Note: In a real implementation, you would check batch info from batch contract
      ;; For now, we'll assume the batch exists if we get to this point
      ;; (batch-info (unwrap! (contract-call? .batch-tokenization get-batch-info batch-token-id) ERR-NOT-FOUND))
    )
    ;; Check if entities are licensed
    (asserts! (is-entity-licensed from-entity) ERR-NOT-LICENSED)
    (asserts! (is-entity-licensed to-entity) ERR-NOT-LICENSED)
    
    ;; Check if batch is not frozen
    (asserts! (not (is-batch-frozen batch-token-id)) ERR-BATCH-INACTIVE)
    
    ;; Check if batch is active and not expired
    ;; Note: These checks would be performed via contract calls in production
    ;; (asserts! (get active batch-info) ERR-BATCH-INACTIVE)
    ;; (asserts! (> (get expiry-date batch-info) block-height) ERR-BATCH-EXPIRED)
    
    ;; Check transfer compliance rules
    (match transfer-rule
      rule (asserts! (get allowed rule) ERR-COMPLIANCE-VIOLATION)
      (asserts! false ERR-COMPLIANCE-VIOLATION) ;; No rule found, disallow transfer
    )
    
    (ok true)
  )
)

(define-public (initiate-transfer
  (batch-token-id uint)
  (to-entity principal)
  (notes (string-utf8 500))
)
  (let
    (
      (new-transfer-id (+ (var-get transfer-id) u1))
      ;; Note: In production, this would get current owner from batch contract
      ;; (current-owner (unwrap! (contract-call? .batch-tokenization get-owner batch-token-id) ERR-NOT-FOUND))
      (from-entity-data (unwrap! (map-get? licensed-entities tx-sender) ERR-NOT-LICENSED))
      (to-entity-data (unwrap! (map-get? licensed-entities to-entity) ERR-NOT-LICENSED))
      (transfer-history (default-to (list) (map-get? batch-transfer-history batch-token-id)))
      (custody-chain (default-to (list) (map-get? batch-custody-chain batch-token-id)))
    )
    ;; Note: In production, validate sender owns the batch
    ;; (asserts! (is-eq (some tx-sender) current-owner) ERR-UNAUTHORIZED)
    
    ;; Validate the transfer
    (try! (validate-transfer batch-token-id tx-sender to-entity))
    
    ;; Create transfer record
    (map-set transfer-records new-transfer-id {
      batch-token-id: batch-token-id,
      from-entity: tx-sender,
      to-entity: to-entity,
      transfer-date: stacks-block-height,
      from-entity-type: (get entity-type from-entity-data),
      to-entity-type: (get entity-type to-entity-data),
      compliance-checked: true,
      authorized-by: tx-sender,
      notes: notes
    })
    
    ;; Update transfer history
    (map-set batch-transfer-history batch-token-id 
      (unwrap! (as-max-len? (append transfer-history new-transfer-id) u100) ERR-INVALID-INPUT))
    
    ;; Update custody chain
    (map-set batch-custody-chain batch-token-id
      (unwrap! (as-max-len? (append custody-chain to-entity) u20) ERR-INVALID-INPUT))
    
    ;; Note: In production, execute the actual NFT transfer
    ;; (try! (contract-call? .batch-tokenization transfer batch-token-id tx-sender to-entity))
    
    ;; Update transfer ID
    (var-set transfer-id new-transfer-id)
    
    ;; Emit transfer event
    (print {
      event: "batch-transferred",
      transfer-id: new-transfer-id,
      batch-token-id: batch-token-id,
      from-entity: tx-sender,
      to-entity: to-entity,
      from-type: (get entity-type from-entity-data),
      to-type: (get entity-type to-entity-data),
      block-height: stacks-block-height,
      notes: notes
    })
    
    (ok new-transfer-id)
  )
)

(define-public (authorize-transfer
  (txfer-id uint)
  (approved bool)
  (regulator-notes (string-utf8 500))
)
  (let
    (
      (transfer-data (unwrap! (map-get? transfer-records txfer-id) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    
    (begin
      (if approved
        (begin
          (map-set transfer-records txfer-id (merge transfer-data {
            compliance-checked: true,
            authorized-by: tx-sender
          }))
          
          (print {
            event: "transfer-approved",
            transfer-id: txfer-id,
            approved-by: tx-sender,
            notes: regulator-notes,
            block-height: stacks-block-height
          })
          true
        )
        (begin
          (print {
            event: "transfer-rejected",
            transfer-id: txfer-id,
            rejected-by: tx-sender,
            notes: regulator-notes,
            block-height: stacks-block-height
          })
          true
        )
      )
    )
    
    (ok approved)
  )
)

;; ===================================
;; Read-Only Functions
;; ===================================

(define-read-only (get-transfer-record (txfer-id uint))
  (map-get? transfer-records txfer-id)
)

(define-read-only (get-batch-transfer-history (batch-token-id uint))
  (map-get? batch-transfer-history batch-token-id)
)

(define-read-only (get-batch-custody-chain (batch-token-id uint))
  (map-get? batch-custody-chain batch-token-id)
)

(define-read-only (get-entity-type-name (entity-type uint))
  (if (is-eq entity-type ENTITY-MANUFACTURER)
    "Manufacturer"
    (if (is-eq entity-type ENTITY-DISTRIBUTOR)
      "Distributor"
      (if (is-eq entity-type ENTITY-PHARMACY)
        "Pharmacy"
        "Unknown"
      )
    )
  )
)

(define-read-only (verify-batch-authenticity (batch-token-id uint))
  (let
    (
      ;; Note: In production, these would be contract calls
      ;; (batch-info (contract-call? .batch-tokenization get-batch-info batch-token-id))
      (transfer-history (map-get? batch-transfer-history batch-token-id))
      (custody-chain (map-get? batch-custody-chain batch-token-id))
    )
    (ok {
      batch-exists: false, ;; Would check via contract call
      batch-active: false, ;; Would check via contract call
      batch-not-expired: false, ;; Would check via contract call
      not-frozen: (not (is-batch-frozen batch-token-id)),
      transfer-count: (match transfer-history some-history (len some-history) u0),
      custody-chain-length: (match custody-chain some-chain (len some-chain) u0)
    })
  )
)

(define-read-only (get-compliance-status (batch-token-id uint))
  (let
    (
      (transfer-history (default-to (list) (map-get? batch-transfer-history batch-token-id)))
      ;; Note: In production, this would be a contract call
      ;; (batch-info (contract-call? .batch-tokenization get-batch-info batch-token-id))
    )
    {
      total-transfers: (len transfer-history),
      all-transfers-compliant: (check-all-transfers-compliant transfer-history),
      batch-active: false, ;; Would check via contract call
      not-frozen: (not (is-batch-frozen batch-token-id)),
      last-checked: stacks-block-height
    }
  )
)

(define-private (check-all-transfers-compliant (transfer-list (list 100 uint)))
  (fold check-transfer-compliance transfer-list true)
)

(define-private (check-transfer-compliance (txfer-id uint) (all-compliant bool))
  (if all-compliant
    (match (map-get? transfer-records txfer-id)
      transfer-data (get compliance-checked transfer-data)
      false
    )
    false
  )
)

;; ===================================
;; Initialization
;; ===================================

;; Initialize contract owner as first regulator
(map-set regulators CONTRACT-OWNER true)

;; Set default transfer compliance rules
(map-set transfer-compliance-rules { from-type: ENTITY-MANUFACTURER, to-type: ENTITY-DISTRIBUTOR } 
  { allowed: true, requires-authorization: false, max-transfer-time: u1000, additional-checks: (list) })

(map-set transfer-compliance-rules { from-type: ENTITY-DISTRIBUTOR, to-type: ENTITY-PHARMACY } 
  { allowed: true, requires-authorization: false, max-transfer-time: u500, additional-checks: (list) })

(map-set transfer-compliance-rules { from-type: ENTITY-MANUFACTURER, to-type: ENTITY-PHARMACY } 
  { allowed: true, requires-authorization: true, max-transfer-time: u200, additional-checks: (list) })