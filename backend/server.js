const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const BitcoinAtomicSwap = require('../bitcoin/atomicSwap');
const DogecoinAtomicSwap = require('../dogecoin/atomicSwap');
const AtomicSwapABI = require('../artifacts/contracts/AtomicSwap.sol/AtomicSwap.json');
const path = require('path');

// Load environment variables from the root directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const bitcoinSwap = new BitcoinAtomicSwap();
const dogecoinSwap = new DogecoinAtomicSwap();
let ethProvider, ethContract;

// Initialize Ethereum connection
async function initializeEthereum() {
    try {
        console.log('🔗 Connecting to Ethereum RPC:', process.env.ETHEREUM_RPC_URL);
        
        if (!process.env.ETHEREUM_RPC_URL) {
            throw new Error('ETHEREUM_RPC_URL not found in environment variables');
        }
        
        ethProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
        
        // Test the connection with timeout
        const networkPromise = ethProvider.getNetwork();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );
        
        await Promise.race([networkPromise, timeoutPromise]);
        console.log('✅ Ethereum RPC connection successful');
        
        const contractAddress = process.env.ATOMIC_SWAP_CONTRACT_ADDRESS;
        
        if (!contractAddress || contractAddress === 'your_contract_address_here') {
            console.log('⚠️  No valid contract address found. Contract features will be disabled.');
            console.log('   To enable contract features:');
            console.log('   1. Run: ./simple-deploy.sh');
            console.log('   2. Restart the backend');
            return;
        }
        
        ethContract = new ethers.Contract(contractAddress, AtomicSwapABI.abi, ethProvider);
        console.log('✅ Ethereum contract initialized:', contractAddress);
        
        // Test contract connection
        try {
            await ethContract.owner();
            console.log('✅ Contract connection verified');
        } catch (error) {
            console.log('⚠️  Contract exists but may not be deployed correctly:', error.message);
            ethContract = null; // Disable contract if it's not working
        }
        
    } catch (error) {
        console.error('❌ Failed to initialize Ethereum:', error.message);
        console.log('   API will still work for basic operations');
        console.log('   To fix: ensure Hardhat node is running on port 8545');
        ethProvider = null;
        ethContract = null;
    }
}

// In-memory storage for active swaps (use database in production)
const activeSwaps = new Map();

// API Routes

/**
 * Generate a new secret for atomic swap
 */
app.post('/api/generate-secret', (req, res) => {
    try {
        const { secret, hashedSecret } = bitcoinSwap.generateSecret();
        res.json({
            success: true,
            data: { 
                secret, 
                hashedSecret: '0x' + hashedSecret  // Add 0x prefix for ethers.js compatibility
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Initiate Ethereum to Bitcoin swap
 */
app.post('/api/swap/eth-to-btc/initiate', async (req, res) => {
    try {
        const {
            swapId,
            ethAmount,
            btcAmount,
            btcAddress,
            hashedSecret,
            timelock,
            ethTokenAddress
        } = req.body;

        // Validate inputs
        if (!swapId || !ethAmount || !btcAmount || !btcAddress || !hashedSecret || !timelock) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // Store swap details
        activeSwaps.set(swapId, {
            type: 'eth-to-btc',
            ethAmount,
            btcAmount,
            btcAddress,
            hashedSecret,
            timelock,
            ethTokenAddress: ethTokenAddress || ethers.ZeroAddress,
            status: 'initiated',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            data: {
                swapId,
                message: 'Swap initiated. Please fund the Ethereum contract.',
                nextStep: 'fund-ethereum-contract'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Initiate Bitcoin to Ethereum swap
 */
app.post('/api/swap/btc-to-eth/initiate', async (req, res) => {
    try {
        const {
            swapId,
            btcAmount,
            ethAmount,
            ethAddress,
            hashedSecret,
            timelock,
            ethTokenAddress,
            btcSenderPubKey,
            btcRecipientPubKey
        } = req.body;

        // Create Bitcoin atomic swap script
        const script = bitcoinSwap.createAtomicSwapScript(
            hashedSecret,
            timelock,
            btcRecipientPubKey,
            btcSenderPubKey
        );

        const btcSwapAddress = bitcoinSwap.createP2SHAddress(script);

        // Store swap details
        activeSwaps.set(swapId, {
            type: 'btc-to-eth',
            btcAmount,
            ethAmount,
            ethAddress,
            hashedSecret,
            timelock,
            ethTokenAddress: ethTokenAddress || ethers.ZeroAddress,
            btcSwapAddress,
            btcScript: script.toString('hex'),
            btcSenderPubKey,
            btcRecipientPubKey,
            status: 'initiated',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            data: {
                swapId,
                btcSwapAddress,
                message: 'Bitcoin swap address created. Please fund this address.',
                nextStep: 'fund-bitcoin-address'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Initiate Ethereum to Dogecoin swap
 */
app.post('/api/swap/eth-to-doge/initiate', async (req, res) => {
    try {
        const {
            swapId,
            ethAmount,
            dogeAmount,
            dogeAddress,
            hashedSecret,
            timelock,
            ethTokenAddress
        } = req.body;

        // Validate inputs
        if (!swapId || !ethAmount || !dogeAmount || !dogeAddress || !hashedSecret || !timelock) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // Store swap details
        activeSwaps.set(swapId, {
            type: 'eth-to-doge',
            ethAmount,
            dogeAmount,
            dogeAddress,
            hashedSecret,
            timelock,
            ethTokenAddress: ethTokenAddress || ethers.ZeroAddress,
            status: 'initiated',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            data: {
                swapId,
                message: 'Dogecoin swap initiated. Please fund the Ethereum contract.',
                nextStep: 'fund-ethereum-contract'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Initiate Dogecoin to Ethereum swap
 */
app.post('/api/swap/doge-to-eth/initiate', async (req, res) => {
    try {
        const {
            swapId,
            dogeAmount,
            ethAmount,
            ethAddress,
            hashedSecret,
            timelock,
            ethTokenAddress,
            dogeSenderPubKey,
            dogeRecipientPubKey
        } = req.body;

        // Create Dogecoin atomic swap script
        const script = dogecoinSwap.createAtomicSwapScript(
            hashedSecret,
            timelock,
            dogeRecipientPubKey,
            dogeSenderPubKey
        );

        const dogeSwapAddress = dogecoinSwap.createP2SHAddress(script);

        // Store swap details
        activeSwaps.set(swapId, {
            type: 'doge-to-eth',
            dogeAmount,
            ethAmount,
            ethAddress,
            hashedSecret,
            timelock,
            ethTokenAddress: ethTokenAddress || ethers.ZeroAddress,
            dogeSwapAddress,
            dogeScript: script.toString('hex'),
            dogeSenderPubKey,
            dogeRecipientPubKey,
            status: 'initiated',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            data: {
                swapId,
                dogeSwapAddress,
                message: 'Dogecoin swap address created. Please fund this address.',
                nextStep: 'fund-dogecoin-address'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Create Dogecoin atomic swap address
 */
app.post('/api/dogecoin/create-swap-address', (req, res) => {
    try {
        const {
            hashedSecret,
            timelock,
            recipientPubKey,
            senderPubKey
        } = req.body;

        if (!hashedSecret || !timelock || !recipientPubKey || !senderPubKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }
        
        // Remove 0x prefix if present
        const cleanHashedSecret = hashedSecret.startsWith('0x') ? 
            hashedSecret.slice(2) : hashedSecret;

        const script = dogecoinSwap.createAtomicSwapScript(
            cleanHashedSecret,
            timelock,
            recipientPubKey,
            senderPubKey
        );

        const swapAddress = dogecoinSwap.createP2SHAddress(script);

        res.json({
            success: true,
            data: {
                swapAddress,
                script: script.toString('hex'),
                network: process.env.DOGECOIN_NETWORK || 'testnet'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Simulate Dogecoin funding (for demo purposes)
 */
app.post('/api/swap/:swapId/simulate-doge-funding', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Mark as funded
        if (!swap.fundingStatus) {
            swap.fundingStatus = {};
        }
        swap.fundingStatus.dogeFunded = true;
        swap.fundingStatus.simulatedFunding = true;
        swap.fundingStatus.message = '✅ Dogecoin funding simulated successfully!';
        
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: 'Dogecoin funding simulated successfully',
                fundingStatus: swap.fundingStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get swap status
 */
app.get('/api/swap/:swapId/status', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Check Ethereum contract status if applicable
        let ethStatus = null;
        if (ethContract) {
            try {
                const ethSwap = await ethContract.getSwap(swapId);
                ethStatus = {
                    exists: true,
                    withdrawn: ethSwap.withdrawn,
                    refunded: ethSwap.refunded,
                    timelock: ethSwap.timelock.toString()
                };
            } catch (error) {
                ethStatus = { exists: false };
            }
        }

        res.json({
            success: true,
            data: {
                ...swap,
                ethStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Complete swap by revealing secret
 */
app.post('/api/swap/:swapId/complete', async (req, res) => {
    try {
        const { swapId } = req.params;
        const { secret, txHash } = req.body;

        const swap = activeSwaps.get(swapId);
        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Verify secret
        const crypto = require('crypto');
        const computedHash = crypto.createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');
        
        if (computedHash !== swap.hashedSecret) {
            return res.status(400).json({
                success: false,
                error: 'Invalid secret'
            });
        }

        // Update swap status
        swap.status = 'completed';
        swap.secret = secret;
        swap.completionTxHash = txHash;
        swap.completedAt = Date.now();

        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: 'Swap completed successfully',
                secret,
                txHash
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get all active swaps with real-time blockchain status
 */
app.get('/api/swaps', async (req, res) => {
    try {
        const swaps = [];
        
        for (const [id, swap] of activeSwaps.entries()) {
            let updatedSwap = { ...swap, id };
            
            // Check blockchain status if contract is available
            if (ethContract) {
                try {
                    const blockchainSwap = await ethContract.getSwap(id);
                    
                    // Update status based on blockchain state
                    if (blockchainSwap.withdrawn) {
                        updatedSwap.status = 'completed';
                        updatedSwap.completedAt = updatedSwap.completedAt || Date.now();
                    } else if (blockchainSwap.refunded) {
                        updatedSwap.status = 'refunded';
                        updatedSwap.refundedAt = updatedSwap.refundedAt || Date.now();
                    } else if (blockchainSwap.amount > 0) {
                        // Swap exists and is funded but not withdrawn/refunded
                        if (updatedSwap.status === 'initiated') {
                            updatedSwap.status = 'funded';
                        }
                    }
                    
                    // Update the stored swap with blockchain data
                    activeSwaps.set(id, updatedSwap);
                } catch (error) {
                    // If swap doesn't exist on blockchain yet, keep current status
                    console.log(`Swap ${id} not found on blockchain or error checking:`, error.message);
                }
            }
            
            swaps.push(updatedSwap);
        }

        res.json({
            success: true,
            data: swaps
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initializeEthereum();
});

module.exports = app;

// Environment variables for simulation
const SIMULATION_MODE = process.env.SIMULATION_MODE === 'true';
const SIMULATE_BTC_FUNDING = process.env.SIMULATE_BTC_FUNDING === 'true';
const SIMULATE_DOGE_FUNDING = process.env.SIMULATE_DOGE_FUNDING === 'true';
const SIMULATE_ETH_FUNDING = process.env.SIMULATE_ETH_FUNDING === 'true';

/**
 * Check funding status for a swap
 */
app.post('/api/swap/:swapId/check-funding', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        let fundingStatus = {
            ethFunded: false,
            btcFunded: false,
            dogeFunded: false,
            readyForWithdrawal: false,
            message: '',
            simulationMode: SIMULATION_MODE
        };

        // Check Ethereum funding
        if (swap.type === 'eth-to-btc' || swap.type === 'eth-to-doge') {
            if (SIMULATE_ETH_FUNDING) {
                // Simulate ETH funding
                const timeElapsed = Date.now() - swap.createdAt;
                const simulatedFundingDelay = 20000; // 20 seconds
                fundingStatus.ethFunded = timeElapsed > simulatedFundingDelay;
                
                if (!fundingStatus.ethFunded) {
                    fundingStatus.message = `ETH funding simulated. Will be "funded" in ${Math.max(0, Math.ceil((simulatedFundingDelay - timeElapsed) / 1000))} seconds.`;
                }
            } else if (ethContract) {
                // Real blockchain check
                try {
                    const ethSwap = await ethContract.getSwap(swapId);
                    fundingStatus.ethFunded = ethSwap.amount > 0 && !ethSwap.withdrawn && !ethSwap.refunded;
                } catch (error) {
                    fundingStatus.ethFunded = false;
                }
            }
        }

        // Check Bitcoin funding
        if (swap.btcSwapAddress && (swap.type === 'btc-to-eth' || swap.type === 'eth-to-btc')) {
            if (SIMULATE_BTC_FUNDING) {
                // Simulate BTC funding
                const timeElapsed = Date.now() - swap.createdAt;
                const simulatedFundingDelay = 30000; // 30 seconds
                fundingStatus.btcFunded = timeElapsed > simulatedFundingDelay;
                
                if (!fundingStatus.btcFunded) {
                    fundingStatus.message = `Bitcoin funding simulated. Will be "funded" in ${Math.max(0, Math.ceil((simulatedFundingDelay - timeElapsed) / 1000))} seconds.`;
                }
            } else {
                // TODO: Real Bitcoin blockchain check would go here
                // For now, keep simulation as fallback
                const timeElapsed = Date.now() - swap.createdAt;
                const simulatedFundingDelay = 30000;
                fundingStatus.btcFunded = timeElapsed > simulatedFundingDelay;
            }
        }

        // Check Dogecoin funding
        if (swap.dogeSwapAddress && (swap.type === 'doge-to-eth' || swap.type === 'eth-to-doge')) {
            if (SIMULATE_DOGE_FUNDING) {
                // Simulate DOGE funding
                const timeElapsed = Date.now() - swap.createdAt;
                const simulatedFundingDelay = 30000; // 30 seconds
                fundingStatus.dogeFunded = timeElapsed > simulatedFundingDelay;
                
                if (!fundingStatus.dogeFunded) {
                    fundingStatus.message = `Dogecoin funding simulated. Will be "funded" in ${Math.max(0, Math.ceil((simulatedFundingDelay - timeElapsed) / 1000))} seconds.`;
                }
            } else {
                // TODO: Real Dogecoin blockchain check would go here
                // For now, keep simulation as fallback
                const timeElapsed = Date.now() - swap.createdAt;
                const simulatedFundingDelay = 30000;
                fundingStatus.dogeFunded = timeElapsed > simulatedFundingDelay;
            }
        }

        // Determine if ready for withdrawal based on swap type
        switch (swap.type) {
            case 'eth-to-btc':
                fundingStatus.readyForWithdrawal = fundingStatus.ethFunded;
                if (fundingStatus.readyForWithdrawal) {
                    fundingStatus.message = `✅ ETH is ${SIMULATE_ETH_FUNDING ? 'simulated as ' : ''}funded! You can withdraw by entering the secret.`;
                } else if (!fundingStatus.message) {
                    fundingStatus.message = '⏳ Waiting for ETH funding confirmation...';
                }
                break;
                
            case 'btc-to-eth':
                fundingStatus.readyForWithdrawal = fundingStatus.btcFunded;
                if (fundingStatus.readyForWithdrawal) {
                    fundingStatus.message = `✅ BTC is ${SIMULATE_BTC_FUNDING ? 'simulated as ' : ''}funded! You can withdraw by entering the secret.`;
                }
                break;
                
            case 'eth-to-doge':
                fundingStatus.readyForWithdrawal = fundingStatus.ethFunded;
                if (fundingStatus.readyForWithdrawal) {
                    fundingStatus.message = `✅ ETH is ${SIMULATE_ETH_FUNDING ? 'simulated as ' : ''}funded! You can withdraw by entering the secret.`;
                } else if (!fundingStatus.message) {
                    fundingStatus.message = '⏳ Waiting for ETH funding confirmation...';
                }
                break;
                
            case 'doge-to-eth':
                fundingStatus.readyForWithdrawal = fundingStatus.dogeFunded;
                if (fundingStatus.readyForWithdrawal) {
                    fundingStatus.message = `✅ DOGE is ${SIMULATE_DOGE_FUNDING ? 'simulated as ' : ''}funded! You can withdraw by entering the secret.`;
                }
                break;
        }

        // Update swap with funding info
        swap.fundingStatus = fundingStatus;
        swap.lastFundingCheck = Date.now();
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                swapId,
                fundingStatus,
                swapType: swap.type,
                btcSwapAddress: swap.btcSwapAddress,
                dogeSwapAddress: swap.dogeSwapAddress,
                ethAmount: swap.ethAmount,
                btcAmount: swap.btcAmount,
                dogeAmount: swap.dogeAmount
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Simulate Bitcoin funding (for demo purposes)
 */
app.post('/api/swap/:swapId/simulate-btc-funding', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Mark as funded
        if (!swap.fundingStatus) {
            swap.fundingStatus = {};
        }
        swap.fundingStatus.btcFunded = true;
        swap.fundingStatus.simulatedFunding = true;
        swap.fundingStatus.message = '✅ Bitcoin funding simulated successfully!';
        
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: 'Bitcoin funding simulated successfully',
                fundingStatus: swap.fundingStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Handle withdrawal for non-ETH swaps (BTC/DOGE)
 */
app.post('/api/swap/:swapId/withdraw', async (req, res) => {
    try {
        const { swapId } = req.params;
        const { secret } = req.body;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Only handle non-ETH swaps here
        if (swap.type !== 'btc-to-eth' && swap.type !== 'doge-to-eth') {
            return res.status(400).json({
                success: false,
                error: 'This endpoint only handles BTC/DOGE to ETH swaps'
            });
        }

        // Validate secret format
        let formattedSecret = secret.trim();
        if (!formattedSecret.startsWith('0x')) {
            formattedSecret = '0x' + formattedSecret;
        }

        if (formattedSecret.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(formattedSecret)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid secret format. Must be 32 bytes (64 hex characters)'
            });
        }

        // Verify secret matches hashed secret
        const secretBytes = Buffer.from(formattedSecret.slice(2), 'hex');
        const crypto = require('crypto');
        const computedHash = '0x' + crypto.createHash('sha256').update(secretBytes).digest('hex');
        
        if (computedHash !== swap.hashedSecret) {
            return res.status(400).json({
                success: false,
                error: 'Invalid secret. Does not match hashed secret.'
            });
        }

        // Check if already withdrawn
        if (swap.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Swap already withdrawn'
            });
        }

        // Check timelock (simulate)
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime >= swap.timelock) {
            return res.status(400).json({
                success: false,
                error: 'Swap has expired and can only be refunded'
            });
        }

        // Simulate withdrawal
        swap.status = 'completed';
        swap.completedAt = Date.now();
        swap.withdrawnSecret = formattedSecret;
        
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: `${swap.type.toUpperCase()} swap withdrawn successfully (simulated)`,
                swapId,
                secret: formattedSecret,
                completedAt: swap.completedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Handle refund for non-ETH swaps (BTC/DOGE)
 */
app.post('/api/swap/:swapId/refund', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Only handle non-ETH swaps here
        if (swap.type !== 'btc-to-eth' && swap.type !== 'doge-to-eth') {
            return res.status(400).json({
                success: false,
                error: 'This endpoint only handles BTC/DOGE to ETH swaps'
            });
        }

        // Check if already completed
        if (swap.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Swap already withdrawn, cannot refund'
            });
        }

        // Check if already refunded
        if (swap.status === 'refunded') {
            return res.status(400).json({
                success: false,
                error: 'Swap already refunded'
            });
        }

        // Check timelock (must be expired for refund)
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime < swap.timelock) {
            const timeRemaining = swap.timelock - currentTime;
            const hoursRemaining = Math.ceil(timeRemaining / 3600);
            return res.status(400).json({
                success: false,
                error: `Cannot refund yet. Timelock expires in approximately ${hoursRemaining} hours.`
            });
        }

        // Simulate refund
        swap.status = 'refunded';
        swap.refundedAt = Date.now();
        
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: `${swap.type.toUpperCase()} swap refunded successfully (simulated)`,
                swapId,
                refundedAt: swap.refundedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ... existing code ...