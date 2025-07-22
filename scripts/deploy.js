const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying AtomicSwap contract...");

    // Get the ContractFactory and Signers
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Deploy the AtomicSwap contract
    const AtomicSwap = await ethers.getContractFactory("AtomicSwap");
    const atomicSwap = await AtomicSwap.deploy();

    await atomicSwap.waitForDeployment();
    const contractAddress = await atomicSwap.getAddress();

    console.log("AtomicSwap contract deployed to:", contractAddress);

    // Save the contract address and ABI for frontend use
    const fs = require('fs');
    const contractInfo = {
        address: contractAddress,
        abi: AtomicSwap.interface.format('json')
    };

    fs.writeFileSync(
        './frontend/src/contracts/AtomicSwap.json',
        JSON.stringify(contractInfo, null, 2)
    );

    console.log("Contract info saved to frontend/src/contracts/AtomicSwap.json");

    // Only verify on real networks (not localhost/hardhat)
    const network = await ethers.provider.getNetwork();
    const isLocalNetwork = network.name === 'localhost' || network.name === 'hardhat' || network.chainId === 31337n;
    
    if (process.env.ETHERSCAN_API_KEY && process.env.ETHERSCAN_API_KEY !== 'your-etherscan-api-key' && !isLocalNetwork) {
        console.log("Waiting for block confirmations...");
        await atomicSwap.deploymentTransaction().wait(6);
        
        try {
            await hre.run("verify:verify", {
                address: contractAddress,
                constructorArguments: [],
            });
            console.log("Contract verified on Etherscan");
        } catch (error) {
            console.log("Verification failed:", error.message);
        }
    } else {
        console.log("Skipping Etherscan verification (local network or no API key)");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });