const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AtomicSwap", function () {
    let atomicSwap;
    let owner, initiator, participant;
    let secret, hashedSecret;
    let timelock;

    beforeEach(async function () {
        [owner, initiator, participant] = await ethers.getSigners();

        const AtomicSwap = await ethers.getContractFactory("AtomicSwap");
        atomicSwap = await AtomicSwap.deploy();
        await atomicSwap.waitForDeployment();

        // Generate secret and hash
        secret = ethers.randomBytes(32);
        hashedSecret = ethers.sha256(secret);
        
        // Set timelock to 1 hour from now
        timelock = (await time.latest()) + 3600;
    });

    describe("Swap Initiation", function () {
        it("Should initiate ETH swap successfully", async function () {
            const swapId = ethers.randomBytes(32);
            const amount = ethers.parseEther("1");

            await expect(
                atomicSwap.connect(initiator).initiateSwap(
                    swapId,
                    participant.address,
                    ethers.ZeroAddress, // ETH
                    amount,
                    hashedSecret,
                    timelock,
                    { value: amount }
                )
            ).to.emit(atomicSwap, "SwapInitiated")
             .withArgs(swapId, initiator.address, participant.address, ethers.ZeroAddress, amount, hashedSecret, timelock);

            const swap = await atomicSwap.getSwap(swapId);
            expect(swap.initiator).to.equal(initiator.address);
            expect(swap.participant).to.equal(participant.address);
            expect(swap.amount).to.equal(amount);
        });

        it("Should fail with invalid parameters", async function () {
            const swapId = ethers.randomBytes(32);
            const amount = ethers.parseEther("1");

            // Invalid participant
            await expect(
                atomicSwap.connect(initiator).initiateSwap(
                    swapId,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    amount,
                    hashedSecret,
                    timelock,
                    { value: amount }
                )
            ).to.be.revertedWith("Invalid participant");

            // Invalid timelock
            await expect(
                atomicSwap.connect(initiator).initiateSwap(
                    swapId,
                    participant.address,
                    ethers.ZeroAddress,
                    amount,
                    hashedSecret,
                    await time.latest() - 1000, // Past timelock
                    { value: amount }
                )
            ).to.be.revertedWith("Timelock must be in the future");
        });

        it("Should fail if swap already exists", async function () {
            const swapId = ethers.randomBytes(32);
            const amount = ethers.parseEther("1");

            // First initiation
            await atomicSwap.connect(initiator).initiateSwap(
                swapId,
                participant.address,
                ethers.ZeroAddress,
                amount,
                hashedSecret,
                timelock,
                { value: amount }
            );

            // Second initiation with same swapId should fail
            await expect(
                atomicSwap.connect(initiator).initiateSwap(
                    swapId,
                    participant.address,
                    ethers.ZeroAddress,
                    amount,
                    hashedSecret,
                    timelock,
                    { value: amount }
                )
            ).to.be.revertedWith("Swap already exists");
        });
    });

    describe("Swap Withdrawal", function () {
        let swapId, amount;

        beforeEach(async function () {
            swapId = ethers.randomBytes(32);
            amount = ethers.parseEther("1");

            await atomicSwap.connect(initiator).initiateSwap(
                swapId,
                participant.address,
                ethers.ZeroAddress,
                amount,
                hashedSecret,
                timelock,
                { value: amount }
            );
        });

        it("Should allow participant to withdraw with correct secret", async function () {
            const initialBalance = await ethers.provider.getBalance(participant.address);

            await expect(
                atomicSwap.connect(participant).withdraw(swapId, secret)
            ).to.emit(atomicSwap, "SwapWithdrawn")
             .withArgs(swapId, secret);

            const finalBalance = await ethers.provider.getBalance(participant.address);
            expect(finalBalance).to.be.gt(initialBalance);

            const swap = await atomicSwap.getSwap(swapId);
            expect(swap.withdrawn).to.be.true;
        });

        it("Should fail withdrawal with wrong secret", async function () {
            const wrongSecret = ethers.randomBytes(32);

            await expect(
                atomicSwap.connect(participant).withdraw(swapId, wrongSecret)
            ).to.be.revertedWith("Invalid secret");
        });

        it("Should fail withdrawal by non-participant", async function () {
            await expect(
                atomicSwap.connect(initiator).withdraw(swapId, secret)
            ).to.be.revertedWith("Only participant can withdraw");
        });

        it("Should fail withdrawal after timelock expires", async function () {
            // Fast forward time past timelock
            await time.increaseTo(timelock + 1);

            await expect(
                atomicSwap.connect(participant).withdraw(swapId, secret)
            ).to.be.revertedWith("Timelock expired");
        });

        it("Should fail double withdrawal", async function () {
            // First withdrawal
            await atomicSwap.connect(participant).withdraw(swapId, secret);

            // Second withdrawal should fail
            await expect(
                atomicSwap.connect(participant).withdraw(swapId, secret)
            ).to.be.revertedWith("Already withdrawn");
        });
    });

    describe("Swap Refund", function () {
        let swapId, amount;

        beforeEach(async function () {
            swapId = ethers.randomBytes(32);
            amount = ethers.parseEther("1");

            await atomicSwap.connect(initiator).initiateSwap(
                swapId,
                participant.address,
                ethers.ZeroAddress,
                amount,
                hashedSecret,
                timelock,
                { value: amount }
            );
        });

        it("Should allow initiator to refund after timelock expires", async function () {
            // Fast forward time past timelock
            await time.increaseTo(timelock + 1);

            const initialBalance = await ethers.provider.getBalance(initiator.address);

            await expect(
                atomicSwap.connect(initiator).refund(swapId)
            ).to.emit(atomicSwap, "SwapRefunded")
             .withArgs(swapId);

            const finalBalance = await ethers.provider.getBalance(initiator.address);
            expect(finalBalance).to.be.gt(initialBalance);

            const swap = await atomicSwap.getSwap(swapId);
            expect(swap.refunded).to.be.true;
        });

        it("Should fail refund before timelock expires", async function () {
            await expect(
                atomicSwap.connect(initiator).refund(swapId)
            ).to.be.revertedWith("Timelock not expired");
        });

        it("Should fail refund by non-initiator", async function () {
            // Fast forward time past timelock
            await time.increaseTo(timelock + 1);

            await expect(
                atomicSwap.connect(participant).refund(swapId)
            ).to.be.revertedWith("Only initiator can refund");
        });

        it("Should fail refund after withdrawal", async function () {
            // First withdraw
            await atomicSwap.connect(participant).withdraw(swapId, secret);

            // Fast forward time past timelock
            await time.increaseTo(timelock + 1);

            // Refund should fail
            await expect(
                atomicSwap.connect(initiator).refund(swapId)
            ).to.be.revertedWith("Already withdrawn");
        });

        it("Should fail double refund", async function () {
            // Fast forward time past timelock
            await time.increaseTo(timelock + 1);

            // First refund
            await atomicSwap.connect(initiator).refund(swapId);

            // Second refund should fail
            await expect(
                atomicSwap.connect(initiator).refund(swapId)
            ).to.be.revertedWith("Already refunded");
        });
    });

    describe("View Functions", function () {
        let swapId, amount;

        beforeEach(async function () {
            swapId = ethers.randomBytes(32);
            amount = ethers.parseEther("1");

            await atomicSwap.connect(initiator).initiateSwap(
                swapId,
                participant.address,
                ethers.ZeroAddress,
                amount,
                hashedSecret,
                timelock,
                { value: amount }
            );
        });

        it("Should check if swap is withdrawable", async function () {
            expect(await atomicSwap.isWithdrawable(swapId, secret)).to.be.true;
            expect(await atomicSwap.isWithdrawable(swapId, ethers.randomBytes(32))).to.be.false;

            // After timelock expires
            await time.increaseTo(timelock + 1);
            expect(await atomicSwap.isWithdrawable(swapId, secret)).to.be.false;
        });

        it("Should check if swap is refundable", async function () {
            expect(await atomicSwap.isRefundable(swapId)).to.be.false;

            // After timelock expires
            await time.increaseTo(timelock + 1);
            expect(await atomicSwap.isRefundable(swapId)).to.be.true;
        });

        it("Should get swap details", async function () {
            const swap = await atomicSwap.getSwap(swapId);
            expect(swap.initiator).to.equal(initiator.address);
            expect(swap.participant).to.equal(participant.address);
            expect(swap.token).to.equal(ethers.ZeroAddress);
            expect(swap.amount).to.equal(amount);
            expect(swap.hashedSecret).to.equal(hashedSecret);
            expect(swap.timelock).to.equal(timelock);
            expect(swap.withdrawn).to.be.false;
            expect(swap.refunded).to.be.false;
        });

        it("Should fail to get non-existent swap", async function () {
            const nonExistentSwapId = ethers.randomBytes(32);
            await expect(
                atomicSwap.getSwap(nonExistentSwapId)
            ).to.be.revertedWith("Swap does not exist");
        });
    });
});
