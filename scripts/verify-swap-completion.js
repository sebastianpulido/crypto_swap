const { ethers } = require('hardhat');

async function verifySwapCompletion() {
    // Your swap details
    const swapId = '0x3f25fdf0a6eb0f455c9b2ed12f181afe8cfa909856723c492278c46637b20e41';
    const secret = 'c4506a2ae19e9cfd4fce75888510a0355262e4b2b093eec0d45185e632ecfa3f';
    
    console.log('🔍 VERIFYING ATOMIC SWAP COMPLETION');
    console.log('=====================================');
    console.log('Swap ID:', swapId);
    console.log('Secret:', secret);
    console.log('');
    
    try {
        // Connect to the contract
        const AtomicSwap = await ethers.getContractFactory('AtomicSwap');
        const contract = AtomicSwap.attach('0x5FbDB2315678afecb367f032d93F642f64180aa3'); // Default Hardhat address
        
        // Get swap details
        const swap = await contract.getSwap(swapId);
        
        console.log('📋 SWAP STATUS:');
        console.log('- Withdrawn:', swap.withdrawn ? '✅ YES' : '❌ NO');
        console.log('- Refunded:', swap.refunded ? '⚠️ YES' : '✅ NO');
        console.log('- Amount:', ethers.formatEther(swap.amount), 'ETH');
        console.log('- Participant:', swap.participant);
        console.log('- Timelock:', new Date(Number(swap.timelock) * 1000).toLocaleString());
        console.log('');
        
        if (swap.withdrawn) {
            console.log('🎉 SUCCESS: Swap has been withdrawn!');
            console.log('💰 The participant should have received', ethers.formatEther(swap.amount), 'ETH');
            
            // Check for withdrawal events
            const filter = contract.filters.SwapWithdrawn(swapId);
            const events = await contract.queryFilter(filter);
            
            if (events.length > 0) {
                const event = events[0];
                console.log('📝 Withdrawal Transaction:', event.transactionHash);
                console.log('🔑 Secret revealed in transaction:', event.args.secret);
                console.log('⛽ Block number:', event.blockNumber);
            }
        } else if (swap.refunded) {
            console.log('🔄 REFUNDED: Swap was refunded to initiator');
        } else {
            console.log('⏳ PENDING: Swap is still active');
        }
        
        // Check participant's ETH balance change
        const provider = ethers.provider;
        const participantBalance = await provider.getBalance(swap.participant);
        console.log('');
        console.log('💳 PARTICIPANT BALANCE:');
        console.log('- Address:', swap.participant);
        console.log('- Current ETH Balance:', ethers.formatEther(participantBalance), 'ETH');
        
    } catch (error) {
        console.error('❌ Error checking swap:', error.message);
    }
}

async function checkBitcoinSide() {
    console.log('');
    console.log('🪙 BITCOIN SIDE VERIFICATION');
    console.log('=============================');
    console.log('');
    console.log('⚠️  IMPORTANT: This project uses SIMULATED Bitcoin transactions!');
    console.log('');
    console.log('📍 What actually happened:');
    console.log('1. ✅ ETH side: Real transaction on Hardhat network');
    console.log('2. 🔄 BTC side: Simulated using bitcoinjs-lib (NO real Bitcoin moved)');
    console.log('');
    console.log('🔍 To see real Bitcoin, you would need:');
    console.log('- Real Bitcoin testnet integration');
    console.log('- Actual Bitcoin transaction broadcasting');
    console.log('- Real P2SH address funding');
    console.log('');
    console.log('💡 Your Electrum wallet is empty because:');
    console.log('- This demo only simulates Bitcoin transactions');
    console.log('- No real Bitcoin testnet transactions were made');
    console.log('- The "Bitcoin address" was just for demonstration');
}

// Run verification
verifySwapCompletion()
    .then(() => checkBitcoinSide())
    .catch(console.error);