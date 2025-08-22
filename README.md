# Decentralized Pharmaceutical Supply Chain Integrity System

A comprehensive blockchain-based solution for tracking pharmaceutical products throughout the entire supply chain, ensuring authenticity, preventing counterfeiting, and maintaining regulatory compliance.

## Overview

This system uses Clarity smart contracts on the Stacks blockchain to create an immutable, transparent, and secure pharmaceutical supply chain. The solution consists of three interconnected contracts that manage batch tokenization, supply chain transfers, and regulatory oversight.

## Features

### 🏭 Batch Tokenization & Manufacturer Registration
- **NFT-based Batch Tracking**: Each pharmaceutical batch is represented as a unique NFT
- **Manufacturer Licensing**: Only approved manufacturers can mint batch tokens
- **Regulator Oversight**: Regulators control manufacturer approval and revocation
- **Batch Metadata**: Comprehensive tracking of drug name, batch ID, production/expiry dates, and quantities

### 🚚 Supply Chain Transfer & Verification
- **Licensed Entity Management**: Support for manufacturers, distributors, and pharmacies
- **Compliance Rules**: Configurable transfer rules between entity types
- **Transfer Authorization**: Optional regulator approval for specific transfer types
- **Audit Trail**: Complete immutable history of all batch transfers
- **Batch Freezing**: Emergency capability to halt suspicious batch movements

### 🏛️ Regulatory Oversight & Product Authentication
- **Investigation Management**: Full case management for regulatory investigations
- **Alert System**: Multi-level alert system for suspicious activities
- **Public Verification**: Consumer and pharmacist batch authentication
- **Audit Reports**: Comprehensive compliance reporting with scoring
- **Quarantine System**: Emergency batch quarantine capabilities

## Smart Contracts

### 1. Batch Tokenization Contract (`batch-tokenization.clar`)

Manages pharmaceutical batch NFTs and manufacturer registration.

**Key Functions:**
- `mint-batch()`: Create a new pharmaceutical batch NFT
- `register-manufacturer()`: Register a new manufacturer
- `approve-manufacturer()`: Approve manufacturer license
- `revoke-manufacturer()`: Revoke manufacturer license
- `transfer()`: Transfer batch ownership
- `deactivate-batch()`: Deactivate a batch

**Key Data:**
- Batch metadata (drug name, batch ID, dates, quantities)
- Manufacturer information and approval status
- NFT ownership tracking

### 2. Supply Chain Transfer Contract (`supply-chain-transfer.clar`)

Manages secure transfers between licensed supply chain entities.

**Key Functions:**
- `register-entity()`: Register supply chain participants
- `approve-entity()`: Approve entity licenses
- `initiate-transfer()`: Start a batch transfer
- `authorize-transfer()`: Regulator approval for transfers
- `freeze-batch()`/`unfreeze-batch()`: Emergency controls
- `verify-batch-authenticity()`: Verify batch legitimacy

**Key Data:**
- Licensed entity information (type, credentials, location)
- Transfer records and compliance tracking
- Custody chain and transfer history
- Compliance rules for different entity types

### 3. Regulatory Oversight Contract (`regulatory-oversight.clar`)

Provides comprehensive oversight, investigation, and public verification capabilities.

**Key Functions:**
- `open-investigation()`/`close-investigation()`: Investigation management
- `create-alert()`/`acknowledge-alert()`: Alert system
- `quarantine-batch()`/`release-quarantine()`: Emergency controls
- `verify-batch-authenticity-public()`: Public verification
- `create-audit-report()`: Compliance reporting
- `flag-suspicious-activity()`: Security monitoring

**Key Data:**
- Investigation cases and evidence
- Alert system with severity levels
- Audit reports and compliance scores
- Public verification logs
- Quarantine status tracking

## Entity Types

1. **Manufacturers (Type 1)**: Produce pharmaceutical products
2. **Distributors (Type 2)**: Distribute products to pharmacies
3. **Pharmacies (Type 3)**: Dispense products to consumers
4. **Regulators**: Oversee the entire system and ensure compliance

## Transfer Compliance Rules

- **Manufacturer → Distributor**: Allowed, no authorization required
- **Distributor → Pharmacy**: Allowed, no authorization required
- **Manufacturer → Pharmacy**: Allowed, requires regulator authorization

## Getting Started

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) - Stacks smart contract development tool
- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Decentralized-Pharmaceutical-Supply-Chain-Integrity-System
```

2. Install dependencies:
```bash
npm install
```

3. Check contract syntax:
```bash
clarinet check
```

4. Run tests:
```bash
npm test
```

### Development

#### Contract Development

The contracts are located in the `contracts/` directory:
- `batch-tokenization.clar`
- `supply-chain-transfer.clar`
- `regulatory-oversight.clar`

#### Testing

Comprehensive test suites are provided in the `tests/` directory:
- `batch-tokenization_test.ts`
- `supply-chain-transfer_test.ts`
- `regulatory-oversight_test.ts`

Run specific test files:
```bash
npm test -- --testNamePattern="Batch Tokenization"
```

#### Interactive Development

Use Clarinet console for interactive testing:
```bash
clarinet console
```

## Usage Examples

### 1. Manufacturer Registration

```clarity
;; Add a regulator
(contract-call? .batch-tokenization add-regulator 'ST1REGULATOR)

;; Register a manufacturer
(contract-call? .batch-tokenization register-manufacturer 
  'ST1MANUFACTURER 
  u"PharmaCorp Ltd" 
  u"LIC-001-PHARMA")

;; Approve the manufacturer
(contract-call? .batch-tokenization approve-manufacturer 'ST1MANUFACTURER)
```

### 2. Batch Creation

```clarity
;; Mint a new batch
(contract-call? .batch-tokenization mint-batch
  u"Aspirin 500mg"
  u"ASP-2024-001"
  u1000  ;; production date (block height)
  u2000  ;; expiry date (block height)
  u5000) ;; quantity
```

### 3. Supply Chain Transfer

```clarity
;; Register and approve entities
(contract-call? .supply-chain-transfer register-entity
  'ST1DISTRIBUTOR
  u2  ;; distributor type
  u"MediDistribute Corp"
  u"DIST-001"
  u"123 Distribution St")

;; Initiate transfer
(contract-call? .supply-chain-transfer initiate-transfer
  u1  ;; batch token ID
  'ST1DISTRIBUTOR
  u"Standard distribution transfer")
```

### 4. Public Verification

```clarity
;; Verify batch authenticity (public function)
(contract-call? .regulatory-oversight verify-batch-authenticity-public
  u"ASP-2024-001"
  (some u"Local Pharmacy"))
```

## Security Features

### Access Control
- **Role-based permissions**: Different functions for regulators, manufacturers, and other entities
- **Multi-signature support**: Critical operations require proper authorization
- **Emergency controls**: Ability to freeze batches and quarantine products

### Data Integrity
- **Immutable records**: All transactions permanently recorded on blockchain
- **Cryptographic verification**: Batch authenticity verified through blockchain
- **Audit trails**: Complete history of all batch movements and ownership changes

### Compliance
- **Regulatory oversight**: Built-in regulator functions for monitoring and control
- **Automated compliance**: Smart contract enforcement of transfer rules
- **Investigation tools**: Comprehensive case management for regulatory investigations

## Testing

The project includes comprehensive test suites covering:

- **Unit Tests**: Individual function testing for all contracts
- **Integration Tests**: Cross-contract interaction testing
- **Edge Cases**: Error handling and boundary condition testing
- **Security Tests**: Access control and permission verification

### Test Coverage

- ✅ Regulator management
- ✅ Manufacturer registration and approval
- ✅ Batch NFT minting and transfer
- ✅ Entity licensing and verification
- ✅ Supply chain transfer workflows
- ✅ Compliance rule enforcement
- ✅ Investigation management
- ✅ Alert system functionality
- ✅ Public verification features
- ✅ Emergency controls (freezing, quarantine)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Regulatory Oversight                     │
│  • Investigation Management  • Alert System                │
│  • Public Verification      • Audit Reports               │
│  • Emergency Controls       • Compliance Monitoring       │
└──────────────────────┬──────────────────────────────────────┘
                      │
┌─────────────────────┼─────────────────────────────────────┐
│              Supply Chain Transfer                         │
│  • Entity Management        • Transfer Authorization      │
│  • Compliance Rules         • Custody Tracking           │
│  • Batch Verification       • Transfer History           │
└─────────────────────┬─────────────────────────────────────┘
                      │
┌─────────────────────┼─────────────────────────────────────┐
│               Batch Tokenization                           │
│  • NFT Minting             • Manufacturer Licensing       │
│  • Batch Metadata          • Ownership Tracking          │
│  • Transfer Functions      • Batch Lifecycle             │
└───────────────────────────────────────────────────────────┘
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add comprehensive tests
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built on the [Stacks blockchain](https://stacks.co/)
- Uses [Clarity smart contract language](https://docs.stacks.co/clarity)
- Developed with [Clarinet development framework](https://github.com/hirosystems/clarinet)

## Support

For questions and support, please open an issue in the GitHub repository.

---

**Note**: This is a demonstration system designed for educational and development purposes. For production deployment, additional security audits, testing, and regulatory compliance verification would be required.
