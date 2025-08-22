import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Supply Chain Transfer: Register and approve entities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const distributor = accounts.get('wallet_3')!;
        const pharmacy = accounts.get('wallet_4')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'add-regulator',
                [types.principal(regulator.address)],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Register manufacturer
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'register-entity',
                [
                    types.principal(manufacturer.address),
                    types.uint(1), // ENTITY-MANUFACTURER
                    types.utf8("Global Pharma Inc"),
                    types.utf8("MFG-001"),
                    types.utf8("123 Pharma Street, Pharma City")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Register distributor
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'register-entity',
                [
                    types.principal(distributor.address),
                    types.uint(2), // ENTITY-DISTRIBUTOR
                    types.utf8("MediDistribute Corp"),
                    types.utf8("DIST-001"),
                    types.utf8("456 Distribution Ave, Supply City")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Register pharmacy
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'register-entity',
                [
                    types.principal(pharmacy.address),
                    types.uint(3), // ENTITY-PHARMACY
                    types.utf8("HealthCare Pharmacy"),
                    types.utf8("PHARM-001"),
                    types.utf8("789 Health Street, Wellness City")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check entity info
        let entityInfo = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-entity-info',
            [types.principal(manufacturer.address)],
            deployer.address
        );
        
        let info = entityInfo.result.expectSome().expectTuple();
        assertEquals(info['entity-type'], types.uint(1));
        assertEquals(info['name'], types.utf8("Global Pharma Inc"));
        assertEquals(info['approved'], types.bool(false));

        // Approve entities
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'approve-entity',
                [types.principal(manufacturer.address)],
                regulator.address
            ),
            Tx.contractCall(
                'supply-chain-transfer',
                'approve-entity',
                [types.principal(distributor.address)],
                regulator.address
            ),
            Tx.contractCall(
                'supply-chain-transfer',
                'approve-entity',
                [types.principal(pharmacy.address)],
                regulator.address
            ),
        ]);

        // Check if entities are licensed
        let isLicensed = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'is-entity-licensed',
            [types.principal(manufacturer.address)],
            deployer.address
        );
        isLicensed.result.expectBool(true);

        isLicensed = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'is-entity-licensed',
            [types.principal(distributor.address)],
            deployer.address
        );
        isLicensed.result.expectBool(true);

        isLicensed = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'is-entity-licensed',
            [types.principal(pharmacy.address)],
            deployer.address
        );
        isLicensed.result.expectBool(true);
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Set and get transfer compliance rules",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'add-regulator',
                [types.principal(regulator.address)],
                deployer.address
            ),
        ]);

        // Set transfer rule
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'set-transfer-rule',
                [
                    types.uint(1), // from manufacturer
                    types.uint(2), // to distributor
                    types.bool(true), // allowed
                    types.bool(false), // requires authorization
                    types.uint(500) // max transfer time
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Get transfer rule
        let rule = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-transfer-rule',
            [types.uint(1), types.uint(2)],
            deployer.address
        );
        
        let ruleData = rule.result.expectSome().expectTuple();
        assertEquals(ruleData['allowed'], types.bool(true));
        assertEquals(ruleData['requires-authorization'], types.bool(false));
        assertEquals(ruleData['max-transfer-time'], types.uint(500));

        // Non-regulator cannot set rules
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'set-transfer-rule',
                [
                    types.uint(2),
                    types.uint(3),
                    types.bool(true),
                    types.bool(true),
                    types.uint(300)
                ],
                deployer.address // deployer is not a regulator in this context
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(401); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Freeze and unfreeze batches",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'add-regulator',
                [types.principal(regulator.address)],
                deployer.address
            ),
        ]);

        const batchId = 1;

        // Freeze batch
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'freeze-batch',
                [
                    types.uint(batchId),
                    types.utf8("Suspected contamination")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check if batch is frozen
        let isFrozen = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'is-batch-frozen',
            [types.uint(batchId)],
            deployer.address
        );
        isFrozen.result.expectBool(true);

        // Unfreeze batch
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'unfreeze-batch',
                [types.uint(batchId)],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check if batch is no longer frozen
        isFrozen = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'is-batch-frozen',
            [types.uint(batchId)],
            deployer.address
        );
        isFrozen.result.expectBool(false);
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Complete transfer workflow with batch creation",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const distributor = accounts.get('wallet_3')!;

        // Setup: Add regulator to both contracts
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('supply-chain-transfer', 'add-regulator', [types.principal(regulator.address)], deployer.address),
        ]);

        // Setup manufacturer in batch contract
        block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("TestMfg"), types.utf8("MFG-TEST")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
        ]);

        // Setup entities in transfer contract
        block = chain.mineBlock([
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(manufacturer.address), types.uint(1), types.utf8("TestMfg"), types.utf8("MFG-TEST"), types.utf8("Location A")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(distributor.address), types.uint(2), types.utf8("TestDist"), types.utf8("DIST-TEST"), types.utf8("Location B")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(manufacturer.address)], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(distributor.address)], regulator.address),
        ]);

        // Create a batch NFT
        const currentBlock = chain.blockHeight;
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Test Medicine"),
                    types.utf8("TEST-BATCH-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(1000)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Initiate transfer from manufacturer to distributor
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'initiate-transfer',
                [
                    types.uint(tokenId),
                    types.principal(distributor.address),
                    types.utf8("Standard distribution transfer")
                ],
                manufacturer.address
            ),
        ]);
        
        const transferId = block.receipts[0].result.expectOk().expectUint(1);

        // Check transfer record
        let transferRecord = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-transfer-record',
            [types.uint(transferId)],
            deployer.address
        );
        
        let record = transferRecord.result.expectSome().expectTuple();
        assertEquals(record['batch-token-id'], types.uint(tokenId));
        assertEquals(record['from-entity'], types.principal(manufacturer.address));
        assertEquals(record['to-entity'], types.principal(distributor.address));
        assertEquals(record['compliance-checked'], types.bool(true));

        // Check batch transfer history
        let transferHistory = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-batch-transfer-history',
            [types.uint(tokenId)],
            deployer.address
        );
        
        let history = transferHistory.result.expectSome().expectList();
        assertEquals(history[0], types.uint(transferId));

        // Check custody chain
        let custodyChain = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-batch-custody-chain',
            [types.uint(tokenId)],
            deployer.address
        );
        
        let chain_data = custodyChain.result.expectSome().expectList();
        assertEquals(chain_data[0], types.principal(distributor.address));

        // Verify batch authenticity
        let authenticity = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'verify-batch-authenticity',
            [types.uint(tokenId)],
            deployer.address
        );
        
        let authResult = authenticity.result.expectOk().expectTuple();
        assertEquals(authResult['batch-exists'], types.bool(true));
        assertEquals(authResult['batch-active'], types.bool(true));
        assertEquals(authResult['not-frozen'], types.bool(true));
        assertEquals(authResult['transfer-count'], types.uint(1));
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Cannot transfer without proper licensing",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const unlicensedEntity = accounts.get('wallet_3')!;

        // Setup regulator and manufacturer
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('supply-chain-transfer', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("TestMfg"), types.utf8("MFG-TEST")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(manufacturer.address), types.uint(1), types.utf8("TestMfg"), types.utf8("MFG-TEST"), types.utf8("Location A")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(manufacturer.address)], regulator.address),
        ]);

        // Create batch
        const currentBlock = chain.blockHeight;
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Test Medicine"),
                    types.utf8("TEST-BATCH-002"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(500)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Try to transfer to unlicensed entity
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'initiate-transfer',
                [
                    types.uint(tokenId),
                    types.principal(unlicensedEntity.address),
                    types.utf8("Attempted unauthorized transfer")
                ],
                manufacturer.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(403); // ERR-NOT-LICENSED
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Cannot transfer frozen batch",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const distributor = accounts.get('wallet_3')!;

        // Setup entities
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('supply-chain-transfer', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("TestMfg"), types.utf8("MFG-TEST")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(manufacturer.address), types.uint(1), types.utf8("TestMfg"), types.utf8("MFG-TEST"), types.utf8("Location A")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(distributor.address), types.uint(2), types.utf8("TestDist"), types.utf8("DIST-TEST"), types.utf8("Location B")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(manufacturer.address)], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(distributor.address)], regulator.address),
        ]);

        // Create batch
        const currentBlock = chain.blockHeight;
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Frozen Test Medicine"),
                    types.utf8("FROZEN-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(300)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Freeze the batch
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'freeze-batch',
                [
                    types.uint(tokenId),
                    types.utf8("Safety investigation")
                ],
                regulator.address
            ),
        ]);

        // Try to transfer frozen batch
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'initiate-transfer',
                [
                    types.uint(tokenId),
                    types.principal(distributor.address),
                    types.utf8("Attempting transfer of frozen batch")
                ],
                manufacturer.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(411); // ERR-BATCH-INACTIVE
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Get entity type names",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;

        // Test entity type names
        let typeName = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-entity-type-name',
            [types.uint(1)],
            deployer.address
        );
        assertEquals(typeName.result.expectUtf8(), "Manufacturer");

        typeName = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-entity-type-name',
            [types.uint(2)],
            deployer.address
        );
        assertEquals(typeName.result.expectUtf8(), "Distributor");

        typeName = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-entity-type-name',
            [types.uint(3)],
            deployer.address
        );
        assertEquals(typeName.result.expectUtf8(), "Pharmacy");

        typeName = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-entity-type-name',
            [types.uint(999)],
            deployer.address
        );
        assertEquals(typeName.result.expectUtf8(), "Unknown");
    },
});

Clarinet.test({
    name: "Supply Chain Transfer: Authorize transfer by regulator",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const pharmacy = accounts.get('wallet_3')!;

        // Setup entities (manufacturer to pharmacy requires authorization)
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('supply-chain-transfer', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("DirectMfg"), types.utf8("DIRECT-MFG")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(manufacturer.address), types.uint(1), types.utf8("DirectMfg"), types.utf8("DIRECT-MFG"), types.utf8("Mfg Location")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'register-entity', [types.principal(pharmacy.address), types.uint(3), types.utf8("DirectPharm"), types.utf8("DIRECT-PHARM"), types.utf8("Pharm Location")], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(manufacturer.address)], regulator.address),
            Tx.contractCall('supply-chain-transfer', 'approve-entity', [types.principal(pharmacy.address)], regulator.address),
        ]);

        // Create batch
        const currentBlock = chain.blockHeight;
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Direct Medicine"),
                    types.utf8("DIRECT-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(100)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Initiate transfer (this should work as default rules allow manufacturer to pharmacy)
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'initiate-transfer',
                [
                    types.uint(tokenId),
                    types.principal(pharmacy.address),
                    types.utf8("Direct to pharmacy transfer")
                ],
                manufacturer.address
            ),
        ]);
        
        const transferId = block.receipts[0].result.expectOk().expectUint(1);

        // Regulator authorizes the transfer
        block = chain.mineBlock([
            Tx.contractCall(
                'supply-chain-transfer',
                'authorize-transfer',
                [
                    types.uint(transferId),
                    types.bool(true),
                    types.utf8("Transfer approved after review")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check transfer record is updated
        let transferRecord = chain.callReadOnlyFn(
            'supply-chain-transfer',
            'get-transfer-record',
            [types.uint(transferId)],
            deployer.address
        );
        
        let record = transferRecord.result.expectSome().expectTuple();
        assertEquals(record['compliance-checked'], types.bool(true));
        assertEquals(record['authorized-by'], types.principal(regulator.address));
    },
});