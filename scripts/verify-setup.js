const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🔍 Verifying project setup...\n");

    // Check if contract is deployed
    const contractInfoPath = './frontend/src/contracts/AtomicSwap.json';
    if (!fs.existsSync(contractInfoPath)) {
        console.log("❌ Contract ABI file not found. Run deployment first.");
        return;
    }

    const contractInfo = JSON.parse(fs.readFileSync(contractInfoPath, 'utf8'));
    if (!contractInfo.address) {
        console.log("❌ Contract address not set. Run deployment first.");
        return;
    }

    console.log("✅ Contract ABI file exists");
    console.log("✅ Contract address:", contractInfo.address);

    // Test contract connection
    try {
        const [deployer] = await ethers.getSigners();
        const contract = new ethers.Contract(contractInfo.address, contractInfo.abi, deployer);
        
        // Try to call a view function
        const owner = await contract.owner();
        console.log("✅ Contract connection successful");
        console.log("✅ Contract owner:", owner);
    } catch (error) {
        console.log("❌ Contract connection failed:", error.message);
    }

    // Check environment variables
    const requiredEnvVars = [
        'ETHEREUM_RPC_URL',
        'PRIVATE_KEY',
        'ATOMIC_SWAP_CONTRACT_ADDRESS'
    ];

    let envComplete = true;
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            console.log(`❌ Missing environment variable: ${envVar}`);
            envComplete = false;
        }
    }

    if (envComplete) {
        console.log("✅ All required environment variables are set");
    }

    // Check file structure
    const requiredFiles = [
        './contracts/AtomicSwap.sol',
        './bitcoin/atomicSwap.js',
        './backend/server.js',
        './frontend/src/App.js',
        './test/AtomicSwap.test.js'
    ];

    let filesComplete = true;
    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            console.log(`❌ Missing file: ${file}`);
            filesComplete = false;
        }
    }

    if (filesComplete) {
        console.log("✅ All required files are present");
    }

    console.log("\n🎉 Setup verification complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });