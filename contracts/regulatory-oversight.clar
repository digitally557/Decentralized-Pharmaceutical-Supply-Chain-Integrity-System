;; Regulatory Oversight & Product Authentication Contract
;; This contract provides comprehensive oversight, tracking, and authentication capabilities for regulators and consumers

;; ===================================
;; Constants and Error Codes
;; ===================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u401))
(define-constant ERR-NOT-FOUND (err u404))
(define-constant ERR-ALREADY-EXISTS (err u409))
(define-constant ERR-INVALID-INPUT (err u400))
(define-constant ERR-ACCESS-DENIED (err u403))
(define-constant ERR-INVESTIGATION-ACTIVE (err u412))

;; Investigation Status Constants
(define-constant INVESTIGATION-PENDING u1)
(define-constant INVESTIGATION-ACTIVE u2)
(define-constant INVESTIGATION-RESOLVED u3)
(define-constant INVESTIGATION-DISMISSED u4)

;; Alert Severity Levels
(define-constant ALERT-LOW u1)
(define-constant ALERT-MEDIUM u2)
(define-constant ALERT-HIGH u3)
(define-constant ALERT-CRITICAL u4)

;; ===================================
;; Data Variables
;; ===================================

(define-data-var investigation-id uint u0)
(define-data-var alert-id uint u0)
(define-data-var audit-report-id uint u0)

;; Contract references
(define-data-var batch-contract principal .batch-tokenization)
(define-data-var transfer-contract principal .supply-chain-transfer)

;; ===================================
;; Data Maps
;; ===================================

;; Regulator permissions and roles
(define-map regulators
  principal
  {
    name: (string-utf8 100),
    organization: (string-utf8 100),
    role: (string-utf8 50),
    jurisdiction: (string-utf8 100),
    active: bool,
    authorized-by: principal,
    authorization-date: uint
  }
)

;; Consumer/Public access for verification
(define-map consumer-access-logs
  { consumer: principal, batch-token-id: uint, timestamp: uint }
  {
    batch-id: (string-utf8 50),
    verification-result: bool,
    access-method: (string-utf8 50),
    location: (optional (string-utf8 200))
  }
)

;; Investigation cases
(define-map investigations
  uint
  {
    batch-token-id: uint,
    investigator: principal,
    status: uint,
    severity: uint,
    title: (string-utf8 200),
    description: (string-utf8 1000),
    opened-date: uint,
    closed-date: (optional uint),
    resolution: (optional (string-utf8 1000)),
    evidence-hash: (optional (buff 32)),
    affected-entities: (list 10 principal)
  }
)

;; Alerts and notifications
(define-map alerts
  uint
  {
    alert-type: (string-utf8 50),
    severity: uint,
    batch-token-id: (optional uint),
    entity: (optional principal),
    message: (string-utf8 500),
    created-by: principal,
    created-date: uint,
    acknowledged: bool,
    acknowledged-by: (optional principal),
    acknowledged-date: (optional uint)
  }
)

;; Audit reports
(define-map audit-reports
  uint
  {
    auditor: principal,
    report-type: (string-utf8 50),
    scope: (string-utf8 200),
    findings: (string-utf8 2000),
    recommendations: (string-utf8 2000),
    compliance-score: uint,
    created-date: uint,
    batches-reviewed: (list 50 uint),
    entities-reviewed: (list 20 principal)
  }
)

;; Suspicious activity tracking
(define-map suspicious-activities
  { entity: principal, activity-type: (string-utf8 50) }
  {
    count: uint,
    last-occurrence: uint,
    flagged: bool,
    investigation-id: (optional uint)
  }
)

;; Batch quarantine status
(define-map quarantined-batches
  uint
  {
    quarantined-by: principal,
    quarantine-date: uint,
    reason: (string-utf8 500),
    investigation-id: (optional uint),
    release-date: (optional uint),
    released-by: (optional principal)
  }
)

;; Public verification requests (for consumers/pharmacists)
(define-map verification-requests
  uint
  {
    requester: principal,
    batch-identifier: (string-utf8 50),
    request-date: uint,
    location: (optional (string-utf8 200)),
    verification-result: (optional bool),
    batch-token-id: (optional uint),
    additional-info: (optional (string-utf8 500))
  }
)

;; ===================================
;; Authorization Functions
;; ===================================

(define-public (add-regulator
  (regulator principal)
  (name (string-utf8 100))
  (organization (string-utf8 100))
  (role (string-utf8 50))
  (jurisdiction (string-utf8 100))
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (is-none (map-get? regulators regulator)) ERR-ALREADY-EXISTS)
    
    (map-set regulators regulator {
      name: name,
      organization: organization,
      role: role,
      jurisdiction: jurisdiction,
      active: true,
      authorized-by: tx-sender,
      authorization-date: stacks-block-height
    })
    
    (print {
      event: "regulator-added",
      regulator: regulator,
      organization: organization,
      role: role,
      authorized-by: tx-sender,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (deactivate-regulator (regulator principal))
  (let
    (
      (regulator-data (unwrap! (map-get? regulators regulator) ERR-NOT-FOUND))
    )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (get active regulator-data) ERR-INVALID-INPUT)
    
    (map-set regulators regulator (merge regulator-data { active: false }))
    
    (ok true)
  )
)

(define-read-only (is-regulator (user principal))
  (match (map-get? regulators user)
    regulator-data (get active regulator-data)
    false
  )
)

(define-read-only (get-regulator-info (regulator principal))
  (map-get? regulators regulator)
)

;; ===================================
;; Investigation Functions
;; ===================================

(define-public (open-investigation
  (batch-token-id uint)
  (severity uint)
  (title (string-utf8 200))
  (description (string-utf8 1000))
  (affected-entities (list 10 principal))
)
  (let
    (
      (new-investigation-id (+ (var-get investigation-id) u1))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (and (>= severity u1) (<= severity u4)) ERR-INVALID-INPUT)
    (asserts! (> (len title) u0) ERR-INVALID-INPUT)
    
    (map-set investigations new-investigation-id {
      batch-token-id: batch-token-id,
      investigator: tx-sender,
      status: INVESTIGATION-ACTIVE,
      severity: severity,
      title: title,
      description: description,
      opened-date: stacks-block-height,
      closed-date: none,
      resolution: none,
      evidence-hash: none,
      affected-entities: affected-entities
    })
    
    (var-set investigation-id new-investigation-id)
    
    ;; Create alert for high severity investigations
    (if (>= severity ALERT-HIGH)
      (begin
        (try! (create-alert u"investigation-opened" severity (some batch-token-id) none 
               u"High severity investigation opened"))
        true
      )
      true
    )
    
    (print {
      event: "investigation-opened",
      investigation-id: new-investigation-id,
      batch-token-id: batch-token-id,
      investigator: tx-sender,
      severity: severity,
      title: title,
      block-height: stacks-block-height
    })
    
    (ok new-investigation-id)
  )
)

(define-public (close-investigation
  (invest-id uint)
  (resolution (string-utf8 1000))
  (evidence-hash (optional (buff 32)))
)
  (let
    (
      (investigation-data (unwrap! (map-get? investigations invest-id) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status investigation-data) INVESTIGATION-ACTIVE) ERR-INVALID-INPUT)
    (asserts! (> (len resolution) u0) ERR-INVALID-INPUT)
    
    (map-set investigations invest-id (merge investigation-data {
      status: INVESTIGATION-RESOLVED,
      closed-date: (some stacks-block-height),
      resolution: (some resolution),
      evidence-hash: evidence-hash
    }))
    
    (print {
      event: "investigation-closed",
      investigation-id: invest-id,
      closed-by: tx-sender,
      resolution: resolution,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-read-only (get-investigation (invest-id uint))
  (map-get? investigations invest-id)
)

(define-read-only (get-active-investigations)
  (filter-investigations-by-status INVESTIGATION-ACTIVE)
)

(define-private (filter-investigations-by-status (target-status uint))
  ;; This is a simplified version - in a real implementation, you'd need a more sophisticated approach
  ;; to iterate through all investigations and filter by status
  (var-get investigation-id) ;; Return current investigation count as placeholder
)

;; ===================================
;; Alert System Functions
;; ===================================

(define-public (create-alert
  (alert-type (string-utf8 50))
  (severity uint)
  (batch-token-id (optional uint))
  (entity (optional principal))
  (message (string-utf8 500))
)
  (let
    (
      (new-alert-id (+ (var-get alert-id) u1))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (and (>= severity u1) (<= severity u4)) ERR-INVALID-INPUT)
    (asserts! (> (len message) u0) ERR-INVALID-INPUT)
    
    (map-set alerts new-alert-id {
      alert-type: alert-type,
      severity: severity,
      batch-token-id: batch-token-id,
      entity: entity,
      message: message,
      created-by: tx-sender,
      created-date: stacks-block-height,
      acknowledged: false,
      acknowledged-by: none,
      acknowledged-date: none
    })
    
    (var-set alert-id new-alert-id)
    
    (print {
      event: "alert-created",
      alert-id: new-alert-id,
      alert-type: alert-type,
      severity: severity,
      message: message,
      created-by: tx-sender,
      block-height: stacks-block-height
    })
    
    (ok new-alert-id)
  )
)

(define-public (acknowledge-alert (alert-uid uint))
  (let
    (
      (alert-data (unwrap! (map-get? alerts alert-uid) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (not (get acknowledged alert-data)) ERR-ALREADY-EXISTS)
    
    (map-set alerts alert-uid (merge alert-data {
      acknowledged: true,
      acknowledged-by: (some tx-sender),
      acknowledged-date: (some stacks-block-height)
    }))
    
    (ok true)
  )
)

(define-read-only (get-alert (alert-uid uint))
  (map-get? alerts alert-uid)
)

;; ===================================
;; Quarantine Functions
;; ===================================

(define-public (quarantine-batch
  (batch-token-id uint)
  (reason (string-utf8 500))
  (invest-id (optional uint))
)
  (begin
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-none (map-get? quarantined-batches batch-token-id)) ERR-ALREADY-EXISTS)
    (asserts! (> (len reason) u0) ERR-INVALID-INPUT)
    
    ;; Note: In production, this would freeze the batch in the transfer contract
    ;; (try! (contract-call? .supply-chain-transfer freeze-batch batch-token-id reason))
    
    (map-set quarantined-batches batch-token-id {
      quarantined-by: tx-sender,
      quarantine-date: stacks-block-height,
      reason: reason,
      investigation-id: invest-id,
      release-date: none,
      released-by: none
    })
    
    ;; Create critical alert
    (try! (create-alert "batch-quarantined" ALERT-CRITICAL (some batch-token-id) none 
           (concat "Batch quarantined: " reason)))
    
    (print {
      event: "batch-quarantined",
      batch-token-id: batch-token-id,
      quarantined-by: tx-sender,
      reason: reason,
      investigation-id: invest-id,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (release-quarantine
  (batch-token-id uint)
  (release-reason (string-utf8 500))
)
  (let
    (
      (quarantine-data (unwrap! (map-get? quarantined-batches batch-token-id) ERR-NOT-FOUND))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-none (get release-date quarantine-data)) ERR-INVALID-INPUT)
    
    ;; Note: In production, this would unfreeze the batch in the transfer contract
    ;; (try! (contract-call? .supply-chain-transfer unfreeze-batch batch-token-id))
    
    (map-set quarantined-batches batch-token-id (merge quarantine-data {
      release-date: (some block-height),
      released-by: (some tx-sender)
    }))
    
    (print {
      event: "quarantine-released",
      batch-token-id: batch-token-id,
      released-by: tx-sender,
      reason: release-reason,
      block-height: stacks-stacks-block-height
    })
    
    (ok true)
  )
)

(define-read-only (is-batch-quarantined (batch-token-id uint))
  (match (map-get? quarantined-batches batch-token-id)
    quarantine-data (is-none (get release-date quarantine-data))
    false
  )
)

;; ===================================
;; Public Verification Functions
;; ===================================

(define-public (verify-batch-authenticity-public
  (batch-identifier (string-utf8 50))
  (location (optional (string-utf8 200)))
)
  (let
    (
      ;; Note: In production, these would be actual contract calls
      ;; (batch-search-result (contract-call? .batch-tokenization get-batch-by-batch-id batch-identifier))
      ;; For demo purposes, we'll assume batch doesn't exist
      (batch-search-result none)
      (verification-result (is-some batch-search-result))
      (request-id (+ (var-get alert-id) u1))
    )
    ;; Log the verification request
    (map-set verification-requests request-id {
      requester: tx-sender,
      batch-identifier: batch-identifier,
      request-date: block-height,
      location: location,
      verification-result: (some verification-result),
      batch-token-id: (match batch-search-result 
        some-result (some (get token-id some-result))
        none
      ),
      additional-info: none
    })
    
    ;; Log consumer access
    (match batch-search-result
      some-result (map-set consumer-access-logs 
        { consumer: tx-sender, batch-token-id: (get token-id some-result), timestamp: block-height }
        {
          batch-id: batch-identifier,
          verification-result: verification-result,
          access-method: "public-verification",
          location: location
        }
      )
      true
    )
    
    (print {
      event: "public-verification",
      requester: tx-sender,
      batch-identifier: batch-identifier,
      verification-result: verification-result,
      location: location,
      block-height: stacks-stacks-block-height
    })
    
    (ok {
      authentic: verification-result,
      batch-found: (is-some batch-search-result),
      verification-id: request-id,
      timestamp: stacks-stacks-block-height
    })
  )
)

(define-read-only (get-batch-public-info (batch-identifier (string-utf8 50)))
  ;; Note: In production, this would call the batch contract
  ;; (match (contract-call? .batch-tokenization get-batch-by-batch-id batch-identifier)
  ;; For now, return error as demo
  (err ERR-NOT-FOUND)
)

;; ===================================
;; Audit and Reporting Functions
;; ===================================

(define-public (create-audit-report
  (report-type (string-utf8 50))
  (scope (string-utf8 200))
  (findings (string-utf8 2000))
  (recommendations (string-utf8 2000))
  (compliance-score uint)
  (batches-reviewed (list 50 uint))
  (entities-reviewed (list 20 principal))
)
  (let
    (
      (new-report-id (+ (var-get audit-report-id) u1))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    (asserts! (<= compliance-score u100) ERR-INVALID-INPUT)
    (asserts! (> (len findings) u0) ERR-INVALID-INPUT)
    
    (map-set audit-reports new-report-id {
      auditor: tx-sender,
      report-type: report-type,
      scope: scope,
      findings: findings,
      recommendations: recommendations,
      compliance-score: compliance-score,
      created-date: block-height,
      batches-reviewed: batches-reviewed,
      entities-reviewed: entities-reviewed
    })
    
    (var-set audit-report-id new-report-id)
    
    ;; Create alert if compliance score is low
    (if (< compliance-score u70)
      (try! (create-alert "low-compliance" ALERT-HIGH none none 
             "Low compliance score detected in audit report"))
      true
    )
    
    (print {
      event: "audit-report-created",
      report-id: new-report-id,
      auditor: tx-sender,
      report-type: report-type,
      compliance-score: compliance-score,
      block-height: stacks-stacks-block-height
    })
    
    (ok new-report-id)
  )
)

(define-read-only (get-audit-report (report-id uint))
  (map-get? audit-reports report-id)
)

;; ===================================
;; Analytics and Dashboard Functions
;; ===================================

(define-read-only (get-system-overview)
  {
    total-investigations: (var-get investigation-id),
    total-alerts: (var-get alert-id),
    total-audit-reports: (var-get audit-report-id),
    current-block: stacks-stacks-block-height
  }
)

(define-read-only (get-batch-full-tracking (batch-token-id uint))
  ;; Note: In production, these would be actual contract calls
  ;; For demo purposes, return simplified data
  {
    batch-info: none,
    transfer-history: none,
    custody-chain: none,
    compliance-status: none,
    quarantined: (is-batch-quarantined batch-token-id),
    quarantine-info: (map-get? quarantined-batches batch-token-id)
  }
)

(define-read-only (search-batches-by-manufacturer (manufacturer principal))
  ;; Note: In production, this would call the batch contract
  ;; (contract-call? .batch-tokenization get-manufacturer-batches manufacturer)
  ;; For demo purposes, return none
  none
)

;; ===================================
;; Suspicious Activity Detection
;; ===================================

(define-public (flag-suspicious-activity
  (entity principal)
  (activity-type (string-utf8 50))
  (investigation-id (optional uint))
)
  (let
    (
      (current-activity (default-to { count: u0, last-occurrence: u0, flagged: false, investigation-id: none } 
                        (map-get? suspicious-activities { entity: entity, activity-type: activity-type })))
    )
    (asserts! (is-regulator tx-sender) ERR-UNAUTHORIZED)
    
    (map-set suspicious-activities { entity: entity, activity-type: activity-type } {
      count: (+ (get count current-activity) u1),
      last-occurrence: block-height,
      flagged: true,
      investigation-id: investigation-id
    })
    
    (print {
      event: "suspicious-activity-flagged",
      entity: entity,
      activity-type: activity-type,
      flagged-by: tx-sender,
      investigation-id: investigation-id,
      block-height: stacks-stacks-block-height
    })
    
    (ok true)
  )
)

;; ===================================
;; Initialization
;; ===================================

;; Initialize contract owner as first regulator
(map-set regulators CONTRACT-OWNER {
  name: "System Administrator",
  organization: "Pharmaceutical Regulatory Authority",
  role: "Chief Regulator",
  jurisdiction: "Global",
  active: true,
  authorized-by: CONTRACT-OWNER,
  authorization-date: stacks-stacks-block-height
})