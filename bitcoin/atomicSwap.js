const bitcoin = require('bitcoinjs-lib');
const crypto = require('crypto');

/**
 * Bitcoin Atomic Swap Implementation
 * Provides hashlock and timelock functionality for Bitcoin side of cross-chain swaps
 */
class BitcoinAtomicSwap {
    constructor(network = bitcoin.networks.testnet) {
        this.network = network;
    }

    /**
     * Generate a random secret and its hash
     * @returns {Object} Object containing secret and hashedSecret
     */
    generateSecret() {
        const secret = crypto.randomBytes(32);
        const hashedSecret = crypto.createHash('sha256').update(secret).digest();
        
        return {
            secret: secret.toString('hex'),
            hashedSecret: hashedSecret.toString('hex')
        };
    }

    /**
     * Create atomic swap script (HTLC)
     * @param {string} hashedSecret - SHA256 hash of the secret
     * @param {number} timelock - Unix timestamp for timelock
     * @param {string} recipientPubKey - Recipient's public key (hex)
     * @param {string} senderPubKey - Sender's public key (hex)
     * @returns {Buffer} Script buffer
     */
    createAtomicSwapScript(hashedSecret, timelock, recipientPubKey, senderPubKey) {
        const hashedSecretBuffer = Buffer.from(hashedSecret, 'hex');
        const recipientPubKeyBuffer = Buffer.from(recipientPubKey, 'hex');
        const senderPubKeyBuffer = Buffer.from(senderPubKey, 'hex');
        
        // Create timelock buffer (4 bytes, little endian)
        const timelockBuffer = Buffer.allocUnsafe(4);
        timelockBuffer.writeUInt32LE(timelock, 0);
        
        // HTLC Script:
        // OP_IF
        //   OP_SHA256 <hashedSecret> OP_EQUALVERIFY <recipientPubKey> OP_CHECKSIG
        // OP_ELSE
        //   <timelock> OP_CHECKLOCKTIMEVERIFY OP_DROP <senderPubKey> OP_CHECKSIG
        // OP_ENDIF
        
        const script = bitcoin.script.compile([
            bitcoin.opcodes.OP_IF,
                bitcoin.opcodes.OP_SHA256,
                hashedSecretBuffer,
                bitcoin.opcodes.OP_EQUALVERIFY,
                recipientPubKeyBuffer,
                bitcoin.opcodes.OP_CHECKSIG,
            bitcoin.opcodes.OP_ELSE,
                timelockBuffer,
                bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
                bitcoin.opcodes.OP_DROP,
                senderPubKeyBuffer,
                bitcoin.opcodes.OP_CHECKSIG,
            bitcoin.opcodes.OP_ENDIF
        ]);
        
        return script;
    }

    /**
     * Create P2SH address from script
     * @param {Buffer} script - Script buffer
     * @returns {string} P2SH address
     */
    createP2SHAddress(script) {
        const p2sh = bitcoin.payments.p2sh({
            redeem: { output: script },
            network: this.network
        });
        
        return p2sh.address;
    }

    /**
     * Create funding transaction
     * @param {Array} utxos - Array of UTXOs
     * @param {string} p2shAddress - P2SH address to fund
     * @param {number} amount - Amount in satoshis
     * @param {string} changeAddress - Change address
     * @param {number} feeRate - Fee rate in sat/byte
     * @returns {Object} Transaction object
     */
    createFundingTransaction(utxos, p2shAddress, amount, changeAddress, feeRate = 10) {
        const psbt = new bitcoin.Psbt({ network: this.network });
        
        let totalInput = 0;
        
        // Add inputs
        utxos.forEach(utxo => {
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: Buffer.from(utxo.scriptPubKey, 'hex'),
                    value: utxo.value
                }
            });
            totalInput += utxo.value;
        });
        
        // Add output to P2SH address
        psbt.addOutput({
            address: p2shAddress,
            value: amount
        });
        
        // Calculate fee
        const estimatedSize = psbt.data.inputs.length * 148 + 2 * 34 + 10;
        const fee = estimatedSize * feeRate;
        
        // Add change output if necessary
        const change = totalInput - amount - fee;
        if (change > 546) { // Dust threshold
            psbt.addOutput({
                address: changeAddress,
                value: change
            });
        }
        
        return psbt;
    }

    /**
     * Create withdrawal transaction (revealing secret)
     * @param {string} fundingTxId - Funding transaction ID
     * @param {number} fundingVout - Funding transaction output index
     * @param {Buffer} script - Atomic swap script
     * @param {string} secret - Secret (hex)
     * @param {string} recipientAddress - Recipient address
     * @param {number} amount - Amount in satoshis
     * @param {Buffer} recipientPrivKey - Recipient private key
     * @returns {Object} Transaction object
     */
    createWithdrawalTransaction(fundingTxId, fundingVout, script, secret, recipientAddress, amount, recipientPrivKey) {
        const psbt = new bitcoin.Psbt({ network: this.network });
        
        // Add input
        psbt.addInput({
            hash: fundingTxId,
            index: fundingVout,
            witnessUtxo: {
                script: bitcoin.payments.p2sh({
                    redeem: { output: script },
                    network: this.network
                }).output,
                value: amount
            },
            redeemScript: script
        });
        
        // Calculate fee (estimate)
        const fee = 250 * 10; // Rough estimate
        
        // Add output
        psbt.addOutput({
            address: recipientAddress,
            value: amount - fee
        });
        
        // Sign with secret path (OP_IF branch)
        const secretBuffer = Buffer.from(secret, 'hex');
        const keyPair = bitcoin.ECPair.fromPrivateKey(recipientPrivKey, { network: this.network });
        
        psbt.signInput(0, keyPair);
        
        // Finalize with secret
        psbt.finalizeInput(0, (inputIndex, input) => {
            const signature = input.partialSig[0].signature;
            const payment = bitcoin.payments.p2sh({
                redeem: {
                    input: bitcoin.script.compile([
                        signature,
                        secretBuffer,
                        bitcoin.opcodes.OP_TRUE // Choose OP_IF branch
                    ]),
                    output: script
                },
                network: this.network
            });
            
            return {
                finalScriptSig: payment.input,
                finalScriptWitness: undefined
            };
        });
        
        return psbt.extractTransaction();
    }

    /**
     * Create refund transaction (after timelock)
     * @param {string} fundingTxId - Funding transaction ID
     * @param {number} fundingVout - Funding transaction output index
     * @param {Buffer} script - Atomic swap script
     * @param {string} senderAddress - Sender address
     * @param {number} amount - Amount in satoshis
     * @param {Buffer} senderPrivKey - Sender private key
     * @param {number} timelock - Timelock value
     * @returns {Object} Transaction object
     */
    createRefundTransaction(fundingTxId, fundingVout, script, senderAddress, amount, senderPrivKey, timelock) {
        const psbt = new bitcoin.Psbt({ network: this.network });
        
        // Set timelock
        psbt.setLocktime(timelock);
        
        // Add input with sequence for timelock
        psbt.addInput({
            hash: fundingTxId,
            index: fundingVout,
            sequence: 0xfffffffe, // Enable timelock
            witnessUtxo: {
                script: bitcoin.payments.p2sh({
                    redeem: { output: script },
                    network: this.network
                }).output,
                value: amount
            },
            redeemScript: script
        });
        
        // Calculate fee
        const fee = 250 * 10;
        
        // Add output
        psbt.addOutput({
            address: senderAddress,
            value: amount - fee
        });
        
        // Sign with timelock path (OP_ELSE branch)
        const keyPair = bitcoin.ECPair.fromPrivateKey(senderPrivKey, { network: this.network });
        
        psbt.signInput(0, keyPair);
        
        // Finalize with timelock path
        psbt.finalizeInput(0, (inputIndex, input) => {
            const signature = input.partialSig[0].signature;
            const payment = bitcoin.payments.p2sh({
                redeem: {
                    input: bitcoin.script.compile([
                        signature,
                        bitcoin.opcodes.OP_FALSE // Choose OP_ELSE branch
                    ]),
                    output: script
                },
                network: this.network
            });
            
            return {
                finalScriptSig: payment.input,
                finalScriptWitness: undefined
            };
        });
        
        return psbt.extractTransaction();
    }

    /**
     * Extract secret from withdrawal transaction
     * @param {string} txHex - Transaction hex
     * @returns {string} Secret (hex)
     */
    extractSecretFromTx(txHex) {
        const tx = bitcoin.Transaction.fromHex(txHex);
        const input = tx.ins[0];
        const script = bitcoin.script.decompile(input.script);
        
        // Secret should be the second element in the script
        if (script && script.length >= 2) {
            const secret = script[1];
            if (Buffer.isBuffer(secret) && secret.length === 32) {
                return secret.toString('hex');
            }
        }
        
        throw new Error('Secret not found in transaction');
    }

    /**
     * Verify secret matches hash
     * @param {string} secret - Secret (hex)
     * @param {string} hashedSecret - Expected hash (hex)
     * @returns {boolean} True if secret is valid
     */
    verifySecret(secret, hashedSecret) {
        const secretBuffer = Buffer.from(secret, 'hex');
        const computedHash = crypto.createHash('sha256').update(secretBuffer).digest('hex');
        return computedHash === hashedSecret;
    }

    /**
     * Get script hash for P2SH address
     * @param {Buffer} script - Script buffer
     * @returns {string} Script hash (hex)
     */
    getScriptHash(script) {
        return crypto.createHash('sha256').update(script).digest('hex');
    }

    /**
     * Create key pair for testing
     * @returns {Object} Key pair object
     */
    createKeyPair() {
        const keyPair = bitcoin.ECPair.makeRandom({ network: this.network });
        return {
            privateKey: keyPair.privateKey.toString('hex'),
            publicKey: keyPair.publicKey.toString('hex'),
            address: bitcoin.payments.p2pkh({ 
                pubkey: keyPair.publicKey, 
                network: this.network 
            }).address
        };
    }
}

module.exports = BitcoinAtomicSwap;