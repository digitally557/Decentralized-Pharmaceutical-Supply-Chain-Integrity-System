import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Regulatory Oversight: Add and manage regulators",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator1 = accounts.get('wallet_1')!;
        const regulator2 = accounts.get('wallet_2')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator1.address),
                    types.utf8("John Smith"),
                    types.utf8("FDA"),
                    types.utf8("Senior Inspector"),
                    types.utf8("United States")
                ],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check regulator info
        let regulatorInfo = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-regulator-info',
            [types.principal(regulator1.address)],
            deployer.address
        );
        
        let info = regulatorInfo.result.expectSome().expectTuple();
        assertEquals(info['name'], types.utf8("John Smith"));
        assertEquals(info['organization'], types.utf8("FDA"));
        assertEquals(info['role'], types.utf8("Senior Inspector"));
        assertEquals(info['jurisdiction'], types.utf8("United States"));
        assertEquals(info['active'], types.bool(true));

        // Check if user is regulator
        let isRegulator = chain.callReadOnlyFn(
            'regulatory-oversight',
            'is-regulator',
            [types.principal(regulator1.address)],
            deployer.address
        );
        isRegulator.result.expectBool(true);

        // Deactivate regulator
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'deactivate-regulator',
                [types.principal(regulator1.address)],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check regulator is deactivated
        isRegulator = chain.callReadOnlyFn(
            'regulatory-oversight',
            'is-regulator',
            [types.principal(regulator1.address)],
            deployer.address
        );
        isRegulator.result.expectBool(false);

        // Non-owner cannot add regulators
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator2.address),
                    types.utf8("Jane Doe"),
                    types.utf8("EMA"),
                    types.utf8("Director"),
                    types.utf8("European Union")
                ],
                regulator1.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(401); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Regulatory Oversight: Create and manage investigations",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator.address),
                    types.utf8("Inspector Johnson"),
                    types.utf8("Health Authority"),
                    types.utf8("Chief Inspector"),
                    types.utf8("Global")
                ],
                deployer.address
            ),
        ]);

        const batchId = 1;
        const affectedEntities = [types.principal(deployer.address)];

        // Open investigation
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'open-investigation',
                [
                    types.uint(batchId),
                    types.uint(3), // HIGH severity
                    types.utf8("Contamination Investigation"),
                    types.utf8("Investigating potential bacterial contamination in batch production facility"),
                    types.list(affectedEntities)
                ],
                regulator.address
            ),
        ]);
        
        const investigationId = block.receipts[0].result.expectOk().expectUint(1);

        // Check investigation details
        let investigation = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-investigation',
            [types.uint(investigationId)],
            deployer.address
        );
        
        let invData = investigation.result.expectSome().expectTuple();
        assertEquals(invData['batch-token-id'], types.uint(batchId));
        assertEquals(invData['investigator'], types.principal(regulator.address));
        assertEquals(invData['status'], types.uint(2)); // INVESTIGATION-ACTIVE
        assertEquals(invData['severity'], types.uint(3));
        assertEquals(invData['title'], types.utf8("Contamination Investigation"));

        // Close investigation
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'close-investigation',
                [
                    types.uint(investigationId),
                    types.utf8("Investigation completed. No contamination found. Batch cleared for distribution."),
                    types.some(types.buff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])))
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check investigation is closed
        investigation = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-investigation',
            [types.uint(investigationId)],
            deployer.address
        );
        
        invData = investigation.result.expectSome().expectTuple();
        assertEquals(invData['status'], types.uint(3)); // INVESTIGATION-RESOLVED
        assertEquals(invData['resolution'], types.some(types.utf8("Investigation completed. No contamination found. Batch cleared for distribution.")));
    },
});

Clarinet.test({
    name: "Regulatory Oversight: Create and acknowledge alerts",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator1 = accounts.get('wallet_1')!;
        const regulator2 = accounts.get('wallet_2')!;

        // Add regulators
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator1.address),
                    types.utf8("Alert Creator"),
                    types.utf8("Health Dept"),
                    types.utf8("Alert Manager"),
                    types.utf8("Region A")
                ],
                deployer.address
            ),
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator2.address),
                    types.utf8("Alert Reviewer"),
                    types.utf8("Health Dept"),
                    types.utf8("Senior Manager"),
                    types.utf8("Region B")
                ],
                deployer.address
            ),
        ]);

        // Create alert
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'create-alert',
                [
                    types.utf8("temperature-violation"),
                    types.uint(2), // MEDIUM severity
                    types.some(types.uint(5)), // batch ID
                    types.some(types.principal(deployer.address)), // entity
                    types.utf8("Temperature storage violation detected during routine inspection")
                ],
                regulator1.address
            ),
        ]);
        
        const alertId = block.receipts[0].result.expectOk().expectUint(1);

        // Check alert details
        let alert = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-alert',
            [types.uint(alertId)],
            deployer.address
        );
        
        let alertData = alert.result.expectSome().expectTuple();
        assertEquals(alertData['alert-type'], types.utf8("temperature-violation"));
        assertEquals(alertData['severity'], types.uint(2));
        assertEquals(alertData['acknowledged'], types.bool(false));

        // Acknowledge alert
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'acknowledge-alert',
                [types.uint(alertId)],
                regulator2.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check alert is acknowledged
        alert = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-alert',
            [types.uint(alertId)],
            deployer.address
        );
        
        alertData = alert.result.expectSome().expectTuple();
        assertEquals(alertData['acknowledged'], types.bool(true));
        assertEquals(alertData['acknowledged-by'], types.some(types.principal(regulator2.address)));

        // Cannot acknowledge already acknowledged alert
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'acknowledge-alert',
                [types.uint(alertId)],
                regulator1.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(409); // ERR-ALREADY-EXISTS
    },
});

Clarinet.test({
    name: "Regulatory Oversight: Quarantine and release batches",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;

        // Add regulator to both contracts
        let block = chain.mineBlock([
            Tx.contractCall('regulatory-oversight', 'add-regulator', [types.principal(regulator.address), types.utf8("Quarantine Officer"), types.utf8("Safety Board"), types.utf8("Officer"), types.utf8("National")], deployer.address),
            Tx.contractCall('supply-chain-transfer', 'add-regulator', [types.principal(regulator.address)], deployer.address),
        ]);

        const batchId = 10;
        const investigationId = 5;

        // Quarantine batch
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'quarantine-batch',
                [
                    types.uint(batchId),
                    types.utf8("Quality control failure - potential dosage inconsistency"),
                    types.some(types.uint(investigationId))
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check batch is quarantined
        let isQuarantined = chain.callReadOnlyFn(
            'regulatory-oversight',
            'is-batch-quarantined',
            [types.uint(batchId)],
            deployer.address
        );
        isQuarantined.result.expectBool(true);

        // Release quarantine
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'release-quarantine',
                [
                    types.uint(batchId),
                    types.utf8("Quality issue resolved, batch meets all specifications")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check batch is no longer quarantined
        isQuarantined = chain.callReadOnlyFn(
            'regulatory-oversight',
            'is-batch-quarantined',
            [types.uint(batchId)],
            deployer.address
        );
        isQuarantined.result.expectBool(false);

        // Non-regulator cannot quarantine
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'quarantine-batch',
                [
                    types.uint(15),
                    types.utf8("Unauthorized quarantine attempt"),
                    types.none()
                ],
                deployer.address // deployer is not a regulator in this context
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(401); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Regulatory Oversight: Public batch verification",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const consumer = accounts.get('wallet_1')!;
        const pharmacist = accounts.get('wallet_2')!;

        // Test public verification (this will return not found since we don't have actual batches)
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'verify-batch-authenticity-public',
                [
                    types.utf8("TEST-BATCH-123"),
                    types.some(types.utf8("Local Pharmacy, Main Street"))
                ],
                consumer.address
            ),
        ]);
        
        let verificationResult = block.receipts[0].result.expectOk().expectTuple();
        assertEquals(verificationResult['authentic'], types.bool(false));
        assertEquals(verificationResult['batch-found'], types.bool(false));

        // Another verification by pharmacist
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'verify-batch-authenticity-public',
                [
                    types.utf8("PHARM-VERIFY-456"),
                    types.some(types.utf8("City Hospital Pharmacy"))
                ],
                pharmacist.address
            ),
        ]);
        
        verificationResult = block.receipts[0].result.expectOk().expectTuple();
        assertEquals(verificationResult['authentic'], types.bool(false));
        assertEquals(verificationResult['batch-found'], types.bool(false));

        // Test getting public info for non-existent batch
        let publicInfo = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-batch-public-info',
            [types.utf8("NON-EXISTENT-BATCH")],
            consumer.address
        );
        
        publicInfo.result.expectErr().expectUint(404); // ERR-NOT-FOUND
    },
});

Clarinet.test({
    name: "Regulatory Oversight: Create audit reports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const auditor = accounts.get('wallet_1')!;

        // Add auditor as regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(auditor.address),
                    types.utf8("Chief Auditor"),
                    types.utf8("Compliance Authority"),
                    types.utf8("Senior Auditor"),
                    types.utf8("International")
                ],
                deployer.address
            ),
        ]);

        const batchesReviewed = [types.uint(1), types.uint(2), types.uint(3)];
        const entitiesReviewed = [types.principal(deployer.address)];

        // Create audit report
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'create-audit-report',
                [
                    types.utf8("compliance-audit"),
                    types.utf8("Quarterly compliance review of pharmaceutical supply chain"),
                    types.utf8("All reviewed entities maintain good compliance standards. Minor documentation improvements needed in batch tracking procedures. Overall supply chain integrity is maintained."),
                    types.utf8("1. Implement automated batch tracking alerts. 2. Enhance staff training on documentation. 3. Increase inspection frequency for high-risk batches."),
                    types.uint(85), // 85% compliance score
                    types.list(batchesReviewed),
                    types.list(entitiesReviewed)
                ],
                auditor.address
            ),
        ]);
        
        const reportId = block.receipts[0].result.expectOk().expectUint(1);

        // Check audit report
        let auditReport = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-audit-report',
            [types.uint(reportId)],
            deployer.address
        );
        
        let reportData = auditReport.result.expectSome().expectTuple();
        assertEquals(reportData['auditor'], types.principal(auditor.address));
        assertEquals(reportData['report-type'], types.utf8("compliance-audit"));
        assertEquals(reportData['compliance-score'], types.uint(85));

        // Create report with low compliance score (should trigger alert)
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'create-audit-report',
                [
                    types.utf8("emergency-audit"),
                    types.utf8("Emergency audit due to compliance violations"),
                    types.utf8("Critical compliance violations found. Immediate action required."),
                    types.utf8("1. Immediate suspension of operations. 2. Complete system overhaul required."),
                    types.uint(45), // Low compliance score
                    types.list([]),
                    types.list([])
                ],
                auditor.address
            ),
        ]);
        
        const emergencyReportId = block.receipts[0].result.expectOk().expectUint(2);

        // Non-regulator cannot create audit reports
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'create-audit-report',
                [
                    types.utf8("unauthorized-audit"),
                    types.utf8("Fake audit scope"),
                    types.utf8("Fake findings"),
                    types.utf8("Fake recommendations"),
                    types.uint(100),
                    types.list([]),
                    types.list([])
                ],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(401); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Regulatory Oversight: Flag suspicious activities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const suspiciousEntity = accounts.get('wallet_2')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator.address),
                    types.utf8("Fraud Investigator"),
                    types.utf8("Security Department"),
                    types.utf8("Senior Investigator"),
                    types.utf8("National")
                ],
                deployer.address
            ),
        ]);

        // Flag suspicious activity
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'flag-suspicious-activity',
                [
                    types.principal(suspiciousEntity.address),
                    types.utf8("unusual-transfer-pattern"),
                    types.some(types.uint(10)) // Related investigation ID
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Flag another suspicious activity for same entity
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'flag-suspicious-activity',
                [
                    types.principal(suspiciousEntity.address),
                    types.utf8("unusual-transfer-pattern"),
                    types.none()
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Non-regulator cannot flag activities
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'flag-suspicious-activity',
                [
                    types.principal(suspiciousEntity.address),
                    types.utf8("fake-activity"),
                    types.none()
                ],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(401); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Regulatory Oversight: System overview and tracking",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'add-regulator',
                [
                    types.principal(regulator.address),
                    types.utf8("System Admin"),
                    types.utf8("Central Authority"),
                    types.utf8("Administrator"),
                    types.utf8("Global")
                ],
                deployer.address
            ),
        ]);

        // Get system overview
        let overview = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-system-overview',
            [],
            deployer.address
        );
        
        let overviewData = overview.result.expectTuple();
        assertEquals(overviewData['total-investigations'], types.uint(0));
        assertEquals(overviewData['total-alerts'], types.uint(0));
        assertEquals(overviewData['total-audit-reports'], types.uint(0));

        // Create some data to see changes
        block = chain.mineBlock([
            Tx.contractCall(
                'regulatory-oversight',
                'open-investigation',
                [
                    types.uint(1),
                    types.uint(1),
                    types.utf8("Test Investigation"),
                    types.utf8("Testing system overview"),
                    types.list([])
                ],
                regulator.address
            ),
            Tx.contractCall(
                'regulatory-oversight',
                'create-alert',
                [
                    types.utf8("test-alert"),
                    types.uint(1),
                    types.none(),
                    types.none(),
                    types.utf8("Test alert message")
                ],
                regulator.address
            ),
        ]);

        // Get updated overview
        overview = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-system-overview',
            [],
            deployer.address
        );
        
        overviewData = overview.result.expectTuple();
        assertEquals(overviewData['total-investigations'], types.uint(1));
        assertEquals(overviewData['total-alerts'], types.uint(1));

        // Test batch full tracking (with non-existent batch)
        let fullTracking = chain.callReadOnlyFn(
            'regulatory-oversight',
            'get-batch-full-tracking',
            [types.uint(999)],
            deployer.address
        );
        
        let trackingData = fullTracking.result.expectTuple();
        assertEquals(trackingData['quarantined'], types.bool(false));

        // Test search batches by manufacturer (will return none for non-existent manufacturer)
        let manufacturerBatches = chain.callReadOnlyFn(
            'regulatory-oversight',
            'search-batches-by-manufacturer',
            [types.principal(deployer.address)],
            deployer.address
        );
        
        manufacturerBatches.result.expectNone();
    },
});