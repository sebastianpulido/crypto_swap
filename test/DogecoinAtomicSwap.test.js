const { expect } = require('chai');
const DogecoinAtomicSwap = require('../dogecoin/atomicSwap');

describe('Dogecoin Atomic Swap', function() {
    let dogecoinSwap;
    let secret, hashedSecret;
    let senderKeyPair, recipientKeyPair;

    beforeEach(function() {
        // Use testnet for testing
        dogecoinSwap = new DogecoinAtomicSwap(DogecoinAtomicSwap.networks.testnet);
        
        // Generate test secret
        const secretData = dogecoinSwap.generateSecret();
        secret = secretData.secret;
        hashedSecret = secretData.hashedSecret;
        
        // Generate test key pairs
        senderKeyPair = dogecoinSwap.createKeyPair();
        recipientKeyPair = dogecoinSwap.createKeyPair();
    });

    describe('Secret Generation', function() {
        it('should generate a valid secret and hash', function() {
            const { secret, hashedSecret } = dogecoinSwap.generateSecret();
            
            expect(secret).to.be.a('string');
            expect(hashedSecret).to.be.a('string');
            expect(secret).to.have.lengthOf(64); // 32 bytes in hex
            expect(hashedSecret).to.have.lengthOf(64); // 32 bytes in hex
        });

        it('should verify secret against hash', function() {
            const isValid = dogecoinSwap.verifySecret(secret, hashedSecret);
            expect(isValid).to.be.true;
        });

        it('should reject invalid secret', function() {
            const invalidSecret = 'a'.repeat(64);
            const isValid = dogecoinSwap.verifySecret(invalidSecret, hashedSecret);
            expect(isValid).to.be.false;
        });
    });

    describe('Key Pair Generation', function() {
        it('should generate valid Dogecoin key pairs', function() {
            const keyPair = dogecoinSwap.createKeyPair();
            
            expect(keyPair).to.have.property('privateKey');
            expect(keyPair).to.have.property('publicKey');
            expect(keyPair).to.have.property('address');
            
            expect(keyPair.privateKey).to.be.a('string');
            expect(keyPair.publicKey).to.be.a('string');
            expect(keyPair.address).to.be.a('string');
            
            // Testnet addresses should start with 'n' or 'm'
            expect(['n', 'm']).to.include(keyPair.address[0]);
        });
    });

    describe('Atomic Swap Script', function() {
        it('should create valid HTLC script', function() {
            const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            
            const script = dogecoinSwap.createAtomicSwapScript(
                hashedSecret,
                timelock,
                recipientKeyPair.publicKey,
                senderKeyPair.publicKey
            );
            
            expect(script).to.be.instanceOf(Buffer);
            expect(script.length).to.be.greaterThan(0);
        });

        it('should create P2SH address from script', function() {
            const timelock = Math.floor(Date.now() / 1000) + 3600;
            
            const script = dogecoinSwap.createAtomicSwapScript(
                hashedSecret,
                timelock,
                recipientKeyPair.publicKey,
                senderKeyPair.publicKey
            );
            
            const p2shAddress = dogecoinSwap.createP2SHAddress(script);
            
            expect(p2shAddress).to.be.a('string');
            // Testnet P2SH addresses start with '2'
            expect(p2shAddress[0]).to.equal('2');
        });
    });

    describe('Amount Conversion', function() {
        it('should convert DOGE to dogeoshis correctly', function() {
            const doge = 1.5;
            const dogeoshis = dogecoinSwap.dogeToDogeoshis(doge);
            
            expect(dogeoshis).to.equal(150000000);
        });

        it('should convert dogeoshis to DOGE correctly', function() {
            const dogeoshis = 250000000;
            const doge = dogecoinSwap.dogeoshisToDoge(dogeoshis);
            
            expect(doge).to.equal(2.5);
        });

        it('should handle fractional DOGE amounts', function() {
            const doge = 0.00000001; // 1 dogeoshi
            const dogeoshis = dogecoinSwap.dogeToDogeoshis(doge);
            
            expect(dogeoshis).to.equal(1);
        });
    });

    describe('Network Configuration', function() {
        it('should use testnet by default', function() {
            const testnetSwap = new DogecoinAtomicSwap();
            expect(testnetSwap.network).to.deep.equal(DogecoinAtomicSwap.networks.testnet);
            expect(testnetSwap.isMainnet).to.be.false;
        });

        it('should support mainnet configuration', function() {
            const mainnetSwap = new DogecoinAtomicSwap(DogecoinAtomicSwap.networks.mainnet);
            expect(mainnetSwap.network).to.deep.equal(DogecoinAtomicSwap.networks.mainnet);
            expect(mainnetSwap.isMainnet).to.be.true;
        });

        it('should have correct network parameters', function() {
            const testnet = DogecoinAtomicSwap.networks.testnet;
            const mainnet = DogecoinAtomicSwap.networks.mainnet;
            
            // Check testnet parameters
            expect(testnet.pubKeyHash).to.equal(0x71);
            expect(testnet.scriptHash).to.equal(0xc4);
            
            // Check mainnet parameters
            expect(mainnet.pubKeyHash).to.equal(0x1e);
            expect(mainnet.scriptHash).to.equal(0x16);
        });
    });

    describe('Integration with Bitcoin Atomic Swap', function() {
        it('should generate compatible secrets with Bitcoin implementation', function() {
            const BitcoinAtomicSwap = require('../bitcoin/atomicSwap');
            const bitcoinSwap = new BitcoinAtomicSwap();
            
            const dogecoinSecret = dogecoinSwap.generateSecret();
            const bitcoinSecret = bitcoinSwap.generateSecret();
            
            // Secrets should have the same format
            expect(dogecoinSecret.secret).to.have.lengthOf(bitcoinSecret.secret.length);
            expect(dogecoinSecret.hashedSecret).to.have.lengthOf(bitcoinSecret.hashedSecret.length);
            
            // Cross-verification should work
            expect(dogecoinSwap.verifySecret(dogecoinSecret.secret, dogecoinSecret.hashedSecret)).to.be.true;
            expect(bitcoinSwap.verifySecret(dogecoinSecret.secret, dogecoinSecret.hashedSecret)).to.be.true;
        });
    });
});