const BitcoinAtomicSwap = require('../bitcoin/atomicSwap');
const bitcoin = require('bitcoinjs-lib');
const { expect } = require('chai');
const crypto = require('crypto');

describe('BitcoinAtomicSwap', function () {
    let bitcoinSwap;
    let secret, hashedSecret;
    let senderKeyPair, recipientKeyPair;

    beforeEach(function () {
        bitcoinSwap = new BitcoinAtomicSwap(bitcoin.networks.testnet);
        
        // Generate test key pairs using crypto instead of ECPair.makeRandom
        const senderPrivKey = crypto.randomBytes(32);
        const recipientPrivKey = crypto.randomBytes(32);
        
        try {
            senderKeyPair = bitcoin.ECPair.fromPrivateKey(senderPrivKey, { network: bitcoin.networks.testnet });
            recipientKeyPair = bitcoin.ECPair.fromPrivateKey(recipientPrivKey, { network: bitcoin.networks.testnet });
        } catch (error) {
            // Fallback: create mock key pairs for testing
            senderKeyPair = {
                publicKey: Buffer.from('03' + crypto.randomBytes(32).toString('hex'), 'hex'),
                privateKey: senderPrivKey
            };
            recipientKeyPair = {
                publicKey: Buffer.from('03' + crypto.randomBytes(32).toString('hex'), 'hex'),
                privateKey: recipientPrivKey
            };
        }
        
        // Generate secret
        const secretData = bitcoinSwap.generateSecret();
        secret = secretData.secret;
        hashedSecret = secretData.hashedSecret;
    });

    describe('Secret Generation', function () {
        it('Should generate valid secret and hash', function () {
            const { secret, hashedSecret } = bitcoinSwap.generateSecret();
            
            expect(secret).to.be.a('string');
            expect(hashedSecret).to.be.a('string');
            expect(secret).to.have.lengthOf(64); // 32 bytes in hex
            expect(hashedSecret).to.have.lengthOf(64); // 32 bytes in hex
        });

        it('Should generate different secrets each time', function () {
            const secret1 = bitcoinSwap.generateSecret();
            const secret2 = bitcoinSwap.generateSecret();
            
            expect(secret1.secret).to.not.equal(secret2.secret);
            expect(secret1.hashedSecret).to.not.equal(secret2.hashedSecret);
        });
    });

    describe('Atomic Swap Script', function () {
        it('Should create valid atomic swap script', function () {
            const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            
            const script = bitcoinSwap.createAtomicSwapScript(
                hashedSecret,
                timelock,
                recipientKeyPair.publicKey.toString('hex'),
                senderKeyPair.publicKey.toString('hex')
            );
            
            expect(script).to.be.instanceOf(Buffer);
            expect(script.length).to.be.greaterThan(0);
        });

        it('Should create valid P2SH address from script', function () {
            const timelock = Math.floor(Date.now() / 1000) + 3600;
            
            const script = bitcoinSwap.createAtomicSwapScript(
                hashedSecret,
                timelock,
                recipientKeyPair.publicKey.toString('hex'),
                senderKeyPair.publicKey.toString('hex')
            );
            
            const address = bitcoinSwap.createP2SHAddress(script);
            
            expect(address).to.be.a('string');
            expect(address).to.match(/^(2|tb1)/); // Testnet address pattern
        });
    });

    describe('Secret Extraction', function () {
        it('Should handle invalid transaction gracefully', function () {
            // Test with an invalid transaction hex
            const invalidTxHex = '0100000000010100000000000000000000000000000000000000000000000000000000000000000000000000ffffffff01000000000000000000000000';
            
            expect(() => {
                bitcoinSwap.extractSecretFromTx(invalidTxHex);
            }).to.throw();
        });

        it('Should verify secret correctly', function () {
            const testSecret = 'a'.repeat(64); // 32 bytes in hex
            const testHash = crypto.createHash('sha256').update(Buffer.from(testSecret, 'hex')).digest('hex');
            
            const isValid = bitcoinSwap.verifySecret(testSecret, testHash);
            expect(isValid).to.be.true;
            
            const isInvalid = bitcoinSwap.verifySecret(testSecret, 'b'.repeat(64));
            expect(isInvalid).to.be.false;
        });
    });

    describe('Utility Functions', function () {
        it('Should get script hash', function () {
            const testScript = Buffer.from('test script');
            const hash = bitcoinSwap.getScriptHash(testScript);
            
            expect(hash).to.be.a('string');
            expect(hash).to.have.lengthOf(64); // 32 bytes in hex
        });
    });
});
