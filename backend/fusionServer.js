const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const FusionCrossChainExtension = require('../fusion/fusionIntegration');
const BitcoinAtomicSwap = require('../bitcoin/atomicSwap');
const DogecoinAtomicSwap = require('../dogecoin/atomicSwap');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize 1inch Fusion+ Extension
let fusionExtension;

async function initializeFusionExtension() {
    try {
        console.log('🚀 Initializing 1inch Fusion+ Cross-Chain Extension...');
        
        const config = {
            fusionApiUrl: process.env.FUSION_API_URL || 'https://api.1inch.dev',
            network: process.env.FUSION_NETWORK || 'ethereum',
            devPortalApiToken: process.env.FUSION_DEV_PORTAL_TOKEN,
            privateKey: process.env.FUSION_PRIVATE_KEY,
            nodeUrl: process.env.ETHEREUM_RPC_URL,
            bitcoinNetwork: process.env.BITCOIN_NETWORK === 'mainnet' ? 
                BitcoinAtomicSwap.networks?.mainnet : BitcoinAtomicSwap.networks?.testnet,
            dogecoinNetwork: process.env.DOGECOIN_NETWORK === 'mainnet' ? 
                DogecoinAtomicSwap.networks?.mainnet : DogecoinAtomicSwap.networks?.testnet
        };

        if (!config.devPortalApiToken) {
            console.log('⚠️  FUSION_DEV_PORTAL_TOKEN not found. Using demo mode.');
            console.log('   To enable full Fusion+ features:');
            console.log('   1. Get API token from 1inch Developer Portal');
            console.log('   2. Add FUSION_DEV_PORTAL_TOKEN to .env');
        }

        fusionExtension = new FusionCrossChainExtension(config);
        console.log('✅ 1inch Fusion+ Extension initialized');
        
        // Test connection
        const supportedPairs = fusionExtension.supportedPairs;
        console.log('✅ Supported cross-chain pairs:', 
            supportedPairs.map(p => `${p.from}-${p.to}`).join(', ')
        );
        
    } catch (error) {
        console.error('❌ Failed to initialize Fusion+ Extension:', error.message);
        console.log('   Falling back to standalone mode');
        fusionExtension = null;
    }
}

// Initialize services
async function initializeServices() {
    await initializeFusionExtension();
}

// API Routes

/**
 * Get supported cross-chain pairs
 */
app.get('/api/fusion/pairs', (req, res) => {
    try {
        if (!fusionExtension) {
            return res.status(503).json({
                success: false,
                error: 'Fusion+ Extension not available'
            });
        }

        const pairs = fusionExtension.supportedPairs.map(pair => ({
            from: pair.from,
            to: pair.to,
            type: 'atomic-swap'
        }));

        res.json({
            success: true,
            data: { pairs }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Create cross-chain swap intent via 1inch Fusion+
 */
app.post('/api/fusion/swap/create', async (req, res) => {
    try {
        if (!fusionExtension) {
            return res.status(503).json({
                success: false,
                error: 'Fusion+ Extension not available'
            });
        }

        const {
            fromToken,
            toToken,
            fromAmount,
            toAmount,
            fromChain,
            toChain,
            userAddress,
            timelock
        } = req.body;

        // Validate inputs
        if (!fromToken || !toToken || !fromAmount || !toAmount || !userAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // Create cross-chain intent
        const result = await fusionExtension.createCrossChainIntent({
            fromToken,
            toToken,
            fromAmount,
            toAmount,
            fromChain: fromChain || 'ethereum',
            toChain: toChain || (toToken === 'BTC' ? 'bitcoin' : 'dogecoin'),
            userAddress,
            timelock: timelock || 24 * 60 * 60 // 24 hours default
        });

        res.json({
            success: true,
            data: {
                swapId: result.swapId,
                fusionOrderHash: result.fusionOrder.orderHash,
                hashedSecret: result.hashedSecret,
                secret: result.secret, // In production, don't return this
                message: 'Cross-chain swap intent created via 1inch Fusion+',
                nextStep: 'monitor-fusion-order'
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
 * Get swap status (Fusion+ integrated)
 */
app.get('/api/fusion/swap/:swapId/status', async (req, res) => {
    try {
        if (!fusionExtension) {
            return res.status(503).json({
                success: false,
                error: 'Fusion+ Extension not available'
            });
        }

        const { swapId } = req.params;
        const status = await fusionExtension.getSwapStatus(swapId);

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        if (error.message === 'Swap not found') {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Complete cross-chain swap
 */
app.post('/api/fusion/swap/:swapId/complete', async (req, res) => {
    try {
        if (!fusionExtension) {
            return res.status(503).json({
                success: false,
                error: 'Fusion+ Extension not available'
            });
        }

        const { swapId } = req.params;
        const { crossChainTxId } = req.body;

        if (!crossChainTxId) {
            return res.status(400).json({
                success: false,
                error: 'Cross-chain transaction ID required'
            });
        }

        const result = await fusionExtension.completeCrossChainSwap(swapId, crossChainTxId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get all active Fusion+ swaps
 */
app.get('/api/fusion/swaps', (req, res) => {
    try {
        if (!fusionExtension) {
            return res.status(503).json({
                success: false,
                error: 'Fusion+ Extension not available'
            });
        }

        const swaps = fusionExtension.getActiveSwaps();

        res.json({
            success: true,
            data: { swaps }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Generate atomic swap secret (for manual operations)
 */
app.post('/api/generate-secret', (req, res) => {
    try {
        const bitcoinSwap = new BitcoinAtomicSwap();
        const { secret, hashedSecret } = bitcoinSwap.generateSecret();
        
        res.json({
            success: true,
            data: { 
                secret, 
                hashedSecret: '0x' + hashedSecret
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

        const dogecoinSwap = new DogecoinAtomicSwap();
        
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
                network: dogecoinSwap.network === DogecoinAtomicSwap.networks.mainnet ? 'mainnet' : 'testnet'
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
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            fusionExtension: !!fusionExtension,
            timestamp: Date.now()
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('API Error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start server
async function startServer() {
    await initializeServices();
    
    app.listen(PORT, () => {
        console.log(`🚀 1inch Fusion+ Cross-Chain Server running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔗 Fusion+ pairs: http://localhost:${PORT}/api/fusion/pairs`);
    });
}

startServer().catch(console.error);

module.exports = app;