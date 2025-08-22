import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Batch Tokenization: Can add and remove regulators",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        let block = chain.mineBlock([
            // Deployer adds user1 as regulator
            Tx.contractCall(
                'batch-tokenization',
                'add-regulator',
                [types.principal(user1.address)],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check if user1 is now a regulator
        let checkRegulator = chain.callReadOnlyFn(
            'batch-tokenization',
            'is-regulator',
            [types.principal(user1.address)],
            deployer.address
        );
        checkRegulator.result.expectBool(true);

        // Non-owner cannot add regulators
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'add-regulator',
                [types.principal(user2.address)],
                user1.address
            ),
        ]);
        
        block.receipts[0].result.expectErr().expectUint(401); // ERR-UNAUTHORIZED

        // Remove regulator
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'remove-regulator',
                [types.principal(user1.address)],
                deployer.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check if user1 is no longer a regulator
        checkRegulator = chain.callReadOnlyFn(
            'batch-tokenization',
            'is-regulator',
            [types.principal(user1.address)],
            deployer.address
        );
        checkRegulator.result.expectBool(false);
    },
});

Clarinet.test({
    name: "Batch Tokenization: Manufacturer registration and approval workflow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;

        // Add regulator
        let block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'add-regulator',
                [types.principal(regulator.address)],
                deployer.address
            ),
        ]);

        // Register manufacturer
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'register-manufacturer',
                [
                    types.principal(manufacturer.address),
                    types.utf8("Pharma Corp Ltd"),
                    types.utf8("LIC-001-PHARMA")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check manufacturer info
        let manufacturerInfo = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-manufacturer-info',
            [types.principal(manufacturer.address)],
            deployer.address
        );
        
        let info = manufacturerInfo.result.expectSome().expectTuple();
        assertEquals(info['name'], types.utf8("Pharma Corp Ltd"));
        assertEquals(info['license-id'], types.utf8("LIC-001-PHARMA"));
        assertEquals(info['approved'], types.bool(false));

        // Approve manufacturer
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'approve-manufacturer',
                [types.principal(manufacturer.address)],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check if manufacturer is approved
        let isApproved = chain.callReadOnlyFn(
            'batch-tokenization',
            'is-manufacturer-approved',
            [types.principal(manufacturer.address)],
            deployer.address
        );
        isApproved.result.expectBool(true);

        // Revoke manufacturer
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'revoke-manufacturer',
                [
                    types.principal(manufacturer.address),
                    types.utf8("Compliance violation")
                ],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check if manufacturer is no longer approved
        isApproved = chain.callReadOnlyFn(
            'batch-tokenization',
            'is-manufacturer-approved',
            [types.principal(manufacturer.address)],
            deployer.address
        );
        isApproved.result.expectBool(false);
    },
});

Clarinet.test({
    name: "Batch Tokenization: Mint batch NFT successfully",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;

        // Setup: Add regulator and approve manufacturer
        let block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'add-regulator',
                [types.principal(regulator.address)],
                deployer.address
            ),
            Tx.contractCall(
                'batch-tokenization',
                'register-manufacturer',
                [
                    types.principal(manufacturer.address),
                    types.utf8("MediCorp"),
                    types.utf8("LIC-002-MED")
                ],
                regulator.address
            ),
            Tx.contractCall(
                'batch-tokenization',
                'approve-manufacturer',
                [types.principal(manufacturer.address)],
                regulator.address
            ),
        ]);

        // Mint batch NFT
        const currentBlock = chain.blockHeight;
        const productionDate = currentBlock;
        const expiryDate = currentBlock + 1000; // Expires 1000 blocks from now

        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Aspirin 500mg"),
                    types.utf8("ASP-2024-001"),
                    types.uint(productionDate),
                    types.uint(expiryDate),
                    types.uint(1000)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Check batch info
        let batchInfo = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-batch-info',
            [types.uint(tokenId)],
            deployer.address
        );
        
        let info = batchInfo.result.expectSome().expectTuple();
        assertEquals(info['drug-name'], types.utf8("Aspirin 500mg"));
        assertEquals(info['batch-id'], types.utf8("ASP-2024-001"));
        assertEquals(info['manufacturer'], types.principal(manufacturer.address));
        assertEquals(info['quantity'], types.uint(1000));
        assertEquals(info['active'], types.bool(true));

        // Check NFT ownership
        let owner = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-owner',
            [types.uint(tokenId)],
            deployer.address
        );
        
        owner.result.expectOk().expectSome().expectPrincipal(manufacturer.address);

        // Check if batch is valid
        let isValid = chain.callReadOnlyFn(
            'batch-tokenization',
            'is-batch-valid',
            [types.uint(tokenId)],
            deployer.address
        );
        isValid.result.expectBool(true);
    },
});

Clarinet.test({
    name: "Batch Tokenization: Cannot mint batch with invalid parameters",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;

        // Setup approved manufacturer
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("TestCorp"), types.utf8("LIC-003")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
        ]);

        const currentBlock = chain.blockHeight;

        // Test empty drug name
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8(""),
                    types.utf8("BATCH-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(1000)
                ],
                manufacturer.address
            ),
        ]);
        block.receipts[0].result.expectErr().expectUint(400); // ERR-INVALID-INPUT

        // Test empty batch ID
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Medicine"),
                    types.utf8(""),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(1000)
                ],
                manufacturer.address
            ),
        ]);
        block.receipts[0].result.expectErr().expectUint(400); // ERR-INVALID-INPUT

        // Test invalid date range (expiry before production)
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Medicine"),
                    types.utf8("BATCH-001"),
                    types.uint(currentBlock + 1000),
                    types.uint(currentBlock),
                    types.uint(1000)
                ],
                manufacturer.address
            ),
        ]);
        block.receipts[0].result.expectErr().expectUint(400); // ERR-INVALID-INPUT

        // Test zero quantity
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Medicine"),
                    types.utf8("BATCH-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(0)
                ],
                manufacturer.address
            ),
        ]);
        block.receipts[0].result.expectErr().expectUint(400); // ERR-INVALID-INPUT
    },
});

Clarinet.test({
    name: "Batch Tokenization: Unapproved manufacturer cannot mint batches",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const unauthorizedUser = accounts.get('wallet_3')!;

        // Setup regulator but don't approve manufacturer
        let block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'add-regulator',
                [types.principal(regulator.address)],
                deployer.address
            ),
        ]);

        const currentBlock = chain.blockHeight;

        // Unapproved manufacturer tries to mint
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Unauthorized Medicine"),
                    types.utf8("UNAUTH-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(1000)
                ],
                manufacturer.address
            ),
        ]);
        block.receipts[0].result.expectErr().expectUint(403); // ERR-MANUFACTURER-NOT-APPROVED

        // Completely unauthorized user tries to mint
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Unauthorized Medicine"),
                    types.utf8("UNAUTH-002"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(1000)
                ],
                unauthorizedUser.address
            ),
        ]);
        block.receipts[0].result.expectErr().expectUint(403); // ERR-MANUFACTURER-NOT-APPROVED
    },
});

Clarinet.test({
    name: "Batch Tokenization: Transfer batch NFT",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;
        const recipient = accounts.get('wallet_3')!;

        // Setup and mint batch
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("TestCorp"), types.utf8("LIC-004")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
        ]);

        const currentBlock = chain.blockHeight;
        
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Transfer Test Medicine"),
                    types.utf8("TTM-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(500)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Transfer the batch
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'transfer',
                [
                    types.uint(tokenId),
                    types.principal(manufacturer.address),
                    types.principal(recipient.address)
                ],
                manufacturer.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check new owner
        let owner = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-owner',
            [types.uint(tokenId)],
            deployer.address
        );
        
        owner.result.expectOk().expectSome().expectPrincipal(recipient.address);

        // Check batch owner mapping
        let batchOwner = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-batch-owner',
            [types.uint(tokenId)],
            deployer.address
        );
        
        batchOwner.result.expectSome().expectPrincipal(recipient.address);
    },
});

Clarinet.test({
    name: "Batch Tokenization: Deactivate batch",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;

        // Setup and mint batch
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("TestCorp"), types.utf8("LIC-005")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
        ]);

        const currentBlock = chain.blockHeight;
        
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Deactivation Test"),
                    types.utf8("DT-001"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(200)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Regulator deactivates batch
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'deactivate-batch',
                [types.uint(tokenId)],
                regulator.address
            ),
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);

        // Check batch is no longer valid
        let isValid = chain.callReadOnlyFn(
            'batch-tokenization',
            'is-batch-valid',
            [types.uint(tokenId)],
            deployer.address
        );
        isValid.result.expectBool(false);

        // Check batch info shows inactive
        let batchInfo = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-batch-info',
            [types.uint(tokenId)],
            deployer.address
        );
        
        let info = batchInfo.result.expectSome().expectTuple();
        assertEquals(info['active'], types.bool(false));
    },
});

Clarinet.test({
    name: "Batch Tokenization: Search batch by batch ID",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const regulator = accounts.get('wallet_1')!;
        const manufacturer = accounts.get('wallet_2')!;

        // Setup and mint batch
        let block = chain.mineBlock([
            Tx.contractCall('batch-tokenization', 'add-regulator', [types.principal(regulator.address)], deployer.address),
            Tx.contractCall('batch-tokenization', 'register-manufacturer', [types.principal(manufacturer.address), types.utf8("SearchCorp"), types.utf8("LIC-006")], regulator.address),
            Tx.contractCall('batch-tokenization', 'approve-manufacturer', [types.principal(manufacturer.address)], regulator.address),
        ]);

        const currentBlock = chain.blockHeight;
        
        block = chain.mineBlock([
            Tx.contractCall(
                'batch-tokenization',
                'mint-batch',
                [
                    types.utf8("Search Test Medicine"),
                    types.utf8("SEARCH-123"),
                    types.uint(currentBlock),
                    types.uint(currentBlock + 1000),
                    types.uint(300)
                ],
                manufacturer.address
            ),
        ]);
        
        const tokenId = block.receipts[0].result.expectOk().expectUint(1);

        // Search for batch by batch ID
        let searchResult = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-batch-by-batch-id',
            [types.utf8("SEARCH-123")],
            deployer.address
        );
        
        let result = searchResult.result.expectSome().expectTuple();
        assertEquals(result['token-id'], types.uint(tokenId));
        
        let metadata = result['metadata'].expectTuple();
        assertEquals(metadata['batch-id'], types.utf8("SEARCH-123"));
        assertEquals(metadata['drug-name'], types.utf8("Search Test Medicine"));

        // Search for non-existent batch
        let nonExistentSearch = chain.callReadOnlyFn(
            'batch-tokenization',
            'get-batch-by-batch-id',
            [types.utf8("NON-EXISTENT")],
            deployer.address
        );
        
        nonExistentSearch.result.expectNone();
    },
});