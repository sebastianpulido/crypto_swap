// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AtomicSwap
 * @dev Ethereum side of cross-chain atomic swap with Bitcoin
 * Implements hashlock and timelock functionality for secure cross-chain swaps
 */
contract AtomicSwap is ReentrancyGuard, Ownable {
    
    struct Swap {
        address initiator;
        address participant;
        address token;
        uint256 amount;
        bytes32 hashedSecret;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        bool exists;
    }
    
    mapping(bytes32 => Swap) public swaps;
    
    event SwapInitiated(
        bytes32 indexed swapId,
        address indexed initiator,
        address indexed participant,
        address token,
        uint256 amount,
        bytes32 hashedSecret,
        uint256 timelock
    );
    
    event SwapWithdrawn(
        bytes32 indexed swapId,
        bytes32 secret
    );
    
    event SwapRefunded(
        bytes32 indexed swapId
    );
    
    modifier swapExists(bytes32 _swapId) {
        require(swaps[_swapId].exists, "Swap does not exist");
        _;
    }
    
    modifier withdrawable(bytes32 _swapId, bytes32 _secret) {
        require(swaps[_swapId].exists, "Swap does not exist");
        require(!swaps[_swapId].withdrawn, "Already withdrawn");
        require(!swaps[_swapId].refunded, "Already refunded");
        require(sha256(abi.encodePacked(_secret)) == swaps[_swapId].hashedSecret, "Invalid secret");
        require(block.timestamp < swaps[_swapId].timelock, "Timelock expired");
        _;
    }
    
    modifier refundable(bytes32 _swapId) {
        require(swaps[_swapId].exists, "Swap does not exist");
        require(!swaps[_swapId].withdrawn, "Already withdrawn");
        require(!swaps[_swapId].refunded, "Already refunded");
        require(block.timestamp >= swaps[_swapId].timelock, "Timelock not expired");
        require(msg.sender == swaps[_swapId].initiator, "Only initiator can refund");
        _;
    }
    
    /**
     * @dev Initiate a new atomic swap
     * @param _swapId Unique identifier for the swap
     * @param _participant Address of the participant (receiver)
     * @param _token Token contract address (address(0) for ETH)
     * @param _amount Amount to swap
     * @param _hashedSecret Hash of the secret
     * @param _timelock Timestamp when the swap expires
     */
    function initiateSwap(
        bytes32 _swapId,
        address _participant,
        address _token,
        uint256 _amount,
        bytes32 _hashedSecret,
        uint256 _timelock
    ) external payable nonReentrant {
        require(!swaps[_swapId].exists, "Swap already exists");
        require(_participant != address(0), "Invalid participant");
        require(_amount > 0, "Amount must be greater than 0");
        require(_timelock > block.timestamp, "Timelock must be in the future");
        require(_hashedSecret != bytes32(0), "Invalid hashed secret");
        
        if (_token == address(0)) {
            // ETH swap
            require(msg.value == _amount, "Incorrect ETH amount");
        } else {
            // ERC20 token swap
            require(msg.value == 0, "ETH not needed for token swap");
            IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        }
        
        swaps[_swapId] = Swap({
            initiator: msg.sender,
            participant: _participant,
            token: _token,
            amount: _amount,
            hashedSecret: _hashedSecret,
            timelock: _timelock,
            withdrawn: false,
            refunded: false,
            exists: true
        });
        
        emit SwapInitiated(
            _swapId,
            msg.sender,
            _participant,
            _token,
            _amount,
            _hashedSecret,
            _timelock
        );
    }
    
    /**
     * @dev Withdraw funds by revealing the secret
     * @param _swapId Swap identifier
     * @param _secret The secret that hashes to hashedSecret
     */
    function withdraw(
        bytes32 _swapId,
        bytes32 _secret
    ) external nonReentrant withdrawable(_swapId, _secret) {
        Swap storage swap = swaps[_swapId];
        require(msg.sender == swap.participant, "Only participant can withdraw");
        
        swap.withdrawn = true;
        
        if (swap.token == address(0)) {
            // ETH transfer
            payable(swap.participant).transfer(swap.amount);
        } else {
            // ERC20 token transfer
            IERC20(swap.token).transfer(swap.participant, swap.amount);
        }
        
        emit SwapWithdrawn(_swapId, _secret);
    }
    
    /**
     * @dev Refund the swap after timelock expires
     * @param _swapId Swap identifier
     */
    function refund(bytes32 _swapId) external nonReentrant refundable(_swapId) {
        Swap storage swap = swaps[_swapId];
        swap.refunded = true;
        
        if (swap.token == address(0)) {
            // ETH refund
            payable(swap.initiator).transfer(swap.amount);
        } else {
            // ERC20 token refund
            IERC20(swap.token).transfer(swap.initiator, swap.amount);
        }
        
        emit SwapRefunded(_swapId);
    }
    
    /**
     * @dev Get swap details
     * @param _swapId Swap identifier
     */
    function getSwap(bytes32 _swapId) external view returns (
        address initiator,
        address participant,
        address token,
        uint256 amount,
        bytes32 hashedSecret,
        uint256 timelock,
        bool withdrawn,
        bool refunded
    ) {
        Swap memory swap = swaps[_swapId];
        require(swap.exists, "Swap does not exist");
        
        return (
            swap.initiator,
            swap.participant,
            swap.token,
            swap.amount,
            swap.hashedSecret,
            swap.timelock,
            swap.withdrawn,
            swap.refunded
        );
    }
    
    /**
     * @dev Check if swap is withdrawable
     * @param _swapId Swap identifier
     * @param _secret Secret to check
     */
    function isWithdrawable(bytes32 _swapId, bytes32 _secret) external view returns (bool) {
        Swap memory swap = swaps[_swapId];
        return swap.exists && 
               !swap.withdrawn && 
               !swap.refunded && 
               sha256(abi.encodePacked(_secret)) == swap.hashedSecret && 
               block.timestamp < swap.timelock;
    }
    
    /**
     * @dev Check if swap is refundable
     * @param _swapId Swap identifier
     */
    function isRefundable(bytes32 _swapId) external view returns (bool) {
        Swap memory swap = swaps[_swapId];
        return swap.exists && 
               !swap.withdrawn && 
               !swap.refunded && 
               block.timestamp >= swap.timelock;
    }
}
