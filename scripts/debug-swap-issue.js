const { ethers } = require('hardhat');

async function debugSwapIssue() {
    console.log('🔧 DEBUGGING SWAP ISSUE');
    console.log('========================');
    
    const swapId = '0x3f25fdf0a6eb0f455c9b2ed12f181afe8cfa909856723c492278c46637b20e41';
    const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    
    try {
        // Check if we're connected to the right network
        const network = await ethers.provider.getNetwork();
        console.log('🌐 Network:', network.name, 'Chain ID:', network.chainId);
        
        // Check if contract exists
        const code = await ethers.provider.getCode(contractAddress);
        console.log('📄 Contract exists:', code !== '0x' ? '✅ YES' : '❌ NO');
        
        if (code === '0x') {
            console.log('');
            console.log('❌ CONTRACT NOT FOUND!');
            console.log('💡 Possible solutions:');
            console.log('1. Restart Hardhat network: npx hardhat node');
            console.log('2. Redeploy contract: npx hardhat run scripts/deploy.js --network localhost');
            console.log('3. Check if you\'re on the right network');
            return;
        }
        
        // Try to connect to contract
        const AtomicSwap = await ethers.getContractFactory('AtomicSwap');
        const contract = AtomicSwap.attach(contractAddress);
        
        console.log('📋 Contract connected successfully');
        
        // Check if swap exists
        try {
            const swap = await contract.getSwap(swapId);
            console.log('✅ Swap found!');
            console.log('- Withdrawn:', swap.withdrawn);
            console.log('- Refunded:', swap.refunded);
            console.log('- Amount:', ethers.formatEther(swap.amount), 'ETH');
        } catch (error) {
            console.log('❌ Swap not found in contract');
            console.log('Error:', error.message);
            
            // Check for any swaps by looking at events
            console.log('');
            console.log('🔍 Searching for any SwapInitiated events...');
            
            try {
                const filter = contract.filters.SwapInitiated();
                const events = await contract.queryFilter(filter);
                
                console.log(`📝 Found ${events.length} total swaps:`);
                events.forEach((event, index) => {
                    console.log(`${index + 1}. Swap ID: ${event.args.swapId}`);
                    console.log(`   Initiator: ${event.args.initiator}`);
                    console.log(`   Amount: ${ethers.formatEther(event.args.amount)} ETH`);
                    console.log(`   Block: ${event.blockNumber}`);
                    console.log('');
                });
                
                if (events.length === 0) {
                    console.log('💡 No swaps found. The Hardhat network was likely restarted.');
                    console.log('   Your swap data was lost when the network reset.');
                }
                
            } catch (eventError) {
                console.log('❌ Error querying events:', eventError.message);
            }
        }
        
        // Check withdrawal events for your specific swap
        console.log('🔍 Checking for withdrawal events...');
        try {
            const withdrawFilter = contract.filters.SwapWithdrawn(swapId);
            const withdrawEvents = await contract.queryFilter(withdrawFilter);
            
            if (withdrawEvents.length > 0) {
                console.log('🎉 WITHDRAWAL FOUND!');
                withdrawEvents.forEach(event => {
                    console.log('- Transaction:', event.transactionHash);
                    console.log('- Block:', event.blockNumber);
                    console.log('- Secret revealed:', event.args.secret);
                });
            } else {
                console.log('❌ No withdrawal events found for this swap ID');
            }
        } catch (error) {
            console.log('❌ Error checking withdrawal events:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Debug error:', error.message);
    }
}

debugSwapIssue().catch(console.error);