import React, { useState } from 'react';
import { ethers } from 'ethers';
import AtomicSwapContract from '../contracts/AtomicSwap.json';

const SwapStatus = ({ swaps, signer, onRefresh }) => {
  const [selectedSwap, setSelectedSwap] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [fundingStatus, setFundingStatus] = useState({});
  const [checkingFunding, setCheckingFunding] = useState(false);

  const withdrawSwap = async (swapId) => {
    if (!secret) {
      alert('Please enter the secret');
      return;
    }

    try {
      setLoading(true);
      
      // Find the swap in our local data to determine its type
      const swap = swaps.find(s => s.id === swapId);
      if (!swap) {
        alert('❌ Swap not found in local data');
        return;
      }

      console.log('Attempting withdrawal for swap type:', swap.type);

      // Handle different swap types
      if (swap.type === 'btc-to-eth' || swap.type === 'doge-to-eth') {
        // For BTC/DOGE to ETH swaps, handle via backend simulation
        await handleNonEthWithdrawal(swapId, secret, swap.type);
      } else if (swap.type === 'eth-to-btc' || swap.type === 'eth-to-doge') {
        // For ETH-based swaps, verify on Ethereum blockchain
        await handleEthWithdrawal(swapId, secret);
      } else {
        alert('❌ Unknown swap type: ' + swap.type);
      }
      
    } catch (error) {
      console.error('Error withdrawing swap:', error);
      alert('❌ Error withdrawing swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEthWithdrawal = async (swapId, secret) => {
    const contract = new ethers.Contract(
      AtomicSwapContract.address,
      AtomicSwapContract.abi,
      signer
    );

    // ENHANCED BLOCKCHAIN CHECK WITH BETTER ERROR HANDLING
    let blockchainSwap;
    try {
      console.log('Checking ETH swap on blockchain:', swapId);
      blockchainSwap = await contract.getSwap(swapId);
      console.log('Blockchain swap details:', {
        withdrawn: blockchainSwap.withdrawn,
        refunded: blockchainSwap.refunded,
        amount: blockchainSwap.amount.toString(),
        timelock: blockchainSwap.timelock.toString(),
        initiator: blockchainSwap.initiator,
        participant: blockchainSwap.participant
      });

      // Check if swap exists (amount > 0 indicates it was created)
      if (blockchainSwap.amount.toString() === '0' && 
          blockchainSwap.initiator === ethers.ZeroAddress) {
        alert('❌ Swap not found on blockchain. Please check the Swap ID.');
        return;
      }

      // Check if already withdrawn
      if (blockchainSwap.withdrawn) {
        alert('❌ This swap has already been withdrawn on the blockchain!');
        onRefresh(); // Refresh to update the UI
        return;
      }

      // Check if already refunded
      if (blockchainSwap.refunded) {
        alert('❌ This swap has already been refunded and cannot be withdrawn!');
        onRefresh(); // Refresh to update the UI
        return;
      }

      // Check if timelock has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime >= blockchainSwap.timelock) {
        alert('❌ This swap has expired and can no longer be withdrawn. It can only be refunded by the initiator.');
        return;
      }

      // Check if swap has any amount (is funded)
      if (blockchainSwap.amount.toString() === '0') {
        alert('❌ This swap is not funded yet!');
        return;
      }

    } catch (error) {
      console.error('Error checking swap on blockchain:', error);
      
      // More specific error handling
      if (error.message.includes('call revert exception') || error.message.includes('BAD_DATA')) {
        alert('❌ Swap not found on blockchain. The Swap ID may be incorrect or the swap was never created.');
      } else if (error.message.includes('network')) {
        alert('❌ Network connection error. Please check your connection and try again.');
      } else {
        alert('❌ Could not verify swap status on blockchain. Error: ' + error.message);
      }
      return;
    }

    // Format the secret properly - ensure it's a valid bytes32
    let formattedSecret = secret.trim();
    if (!formattedSecret.startsWith('0x')) {
      formattedSecret = '0x' + formattedSecret;
    }
    
    console.log('Using secret:', formattedSecret);
    
    // Ensure it's 32 bytes (64 hex characters + 0x)
    if (formattedSecret.length !== 66) {
      alert('❌ Secret must be exactly 32 bytes (64 hex characters)');
      return;
    }

    // Validate hex format
    if (!/^0x[0-9a-fA-F]{64}$/.test(formattedSecret)) {
      alert('❌ Secret must be a valid hexadecimal string');
      return;
    }

    // Verify the secret matches the hashed secret
    const secretBytes = ethers.getBytes(formattedSecret);
    const computedHash = ethers.sha256(secretBytes);
    console.log('Computed hash:', computedHash);
    console.log('Expected hash:', blockchainSwap.hashedSecret);
    
    if (computedHash !== blockchainSwap.hashedSecret) {
      alert('❌ Invalid secret! The secret does not match the hashed secret for this swap.');
      return;
    }

    // Check if user is the participant (allowed to withdraw)
    const userAddress = await signer.getAddress();
    if (userAddress.toLowerCase() !== blockchainSwap.participant.toLowerCase()) {
      alert('❌ Only the participant can withdraw this swap!');
      return;
    }

    console.log('All checks passed. Attempting withdrawal for swap:', swapId);
    
    // Estimate gas first to catch any revert early
    try {
      await contract.withdraw.staticCall(swapId, formattedSecret);
    } catch (staticError) {
      console.error('Static call failed:', staticError);
      if (staticError.message.includes('Already withdrawn')) {
        alert('❌ This swap has already been withdrawn!');
        onRefresh();
        return;
      } else if (staticError.message.includes('Invalid secret')) {
        alert('❌ Invalid secret provided!');
        return;
      } else if (staticError.message.includes('Timelock expired')) {
        alert('❌ This swap has expired!');
        return;
      } else {
        alert('❌ Transaction would fail: ' + staticError.message);
        return;
      }
    }

    // Execute the actual withdrawal
    const tx = await contract.withdraw(swapId, formattedSecret);
    console.log('Withdrawal transaction sent:', tx.hash);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    console.log('Withdrawal confirmed:', receipt);

    alert('✅ Swap withdrawn successfully!');
    setSecret(''); // Clear the secret input
    setSelectedSwap(''); // Clear the selected swap
    onRefresh(); // Refresh the swap list
  };

  const handleNonEthWithdrawal = async (swapId, secret, swapType) => {
    console.log(`Handling ${swapType} withdrawal via backend simulation`);
    
    // For BTC/DOGE swaps, we simulate the withdrawal via backend
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/swap/${swapId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${swapType.toUpperCase()} swap withdrawn successfully! (Simulated)`);
        setSecret(''); // Clear the secret input
        setSelectedSwap(''); // Clear the selected swap
        onRefresh(); // Refresh the swap list
      } else {
        alert('❌ Error withdrawing swap: ' + result.error);
      }
    } catch (error) {
      console.error('Error with backend withdrawal:', error);
      alert('❌ Error communicating with backend: ' + error.message);
    }
  };

  const refundSwap = async (swapId) => {
    try {
      setLoading(true);
      
      // Find the swap in our local data to determine its type
      const swap = swaps.find(s => s.id === swapId);
      if (!swap) {
        alert('❌ Swap not found in local data');
        return;
      }

      console.log('Attempting refund for swap type:', swap.type);

      // Handle different swap types
      if (swap.type === 'btc-to-eth' || swap.type === 'doge-to-eth') {
        // For BTC/DOGE to ETH swaps, handle via backend simulation
        await handleNonEthRefund(swapId, swap.type);
      } else if (swap.type === 'eth-to-btc' || swap.type === 'eth-to-doge') {
        // For ETH-based swaps, verify on Ethereum blockchain
        await handleEthRefund(swapId);
      } else {
        alert('❌ Unknown swap type: ' + swap.type);
      }
      
    } catch (error) {
      console.error('Error refunding swap:', error);
      alert('❌ Error refunding swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEthRefund = async (swapId) => {
    const contract = new ethers.Contract(
      AtomicSwapContract.address,
      AtomicSwapContract.abi,
      signer
    );

    // Check blockchain state first
    try {
      const blockchainSwap = await contract.getSwap(swapId);
      
      if (blockchainSwap.withdrawn) {
        alert('❌ This swap has already been withdrawn and cannot be refunded!');
        onRefresh();
        return;
      }

      if (blockchainSwap.refunded) {
        alert('❌ This swap has already been refunded!');
        onRefresh();
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime < blockchainSwap.timelock) {
        const timeRemaining = blockchainSwap.timelock - currentTime;
        const hoursRemaining = Math.ceil(timeRemaining / 3600);
        alert(`❌ Cannot refund yet. Timelock expires in approximately ${hoursRemaining} hours.`);
        return;
      }

      const userAddress = await signer.getAddress();
      if (userAddress.toLowerCase() !== blockchainSwap.initiator.toLowerCase()) {
        alert('❌ Only the initiator can refund this swap!');
        return;
      }

    } catch (error) {
      console.error('Error checking swap for refund:', error);
      if (error.message.includes('BAD_DATA')) {
        alert('❌ Swap not found on blockchain. Cannot refund.');
      } else {
        alert('❌ Could not verify swap status for refund.');
      }
      return;
    }

    const tx = await contract.refund(swapId);
    await tx.wait();

    alert('✅ Swap refunded successfully!');
    onRefresh();
  };

  const handleNonEthRefund = async (swapId, swapType) => {
    console.log(`Handling ${swapType} refund via backend simulation`);
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/swap/${swapId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${swapType.toUpperCase()} swap refunded successfully! (Simulated)`);
        onRefresh(); // Refresh the swap list
      } else {
        alert('❌ Error refunding swap: ' + result.error);
      }
    } catch (error) {
      console.error('Error with backend refund:', error);
      alert('❌ Error communicating with backend: ' + error.message);
    }
  };

  const fundEthSwap = async (swapId, ethAmount) => {
    try {
      setLoading(true);
      
      // Check if we're in simulation mode by checking funding status first
      const fundingResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/swap/${swapId}/check-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const fundingResult = await fundingResponse.json();
      const isSimulationMode = fundingResult.data?.fundingStatus?.simulationMode;
      
      if (isSimulationMode && process.env.REACT_APP_SIMULATE_ETH_FUNDING === 'true') {
        // Simulate ETH funding
        alert('🎭 ETH funding simulated! (Simulation mode enabled)');
        await checkFundingStatus(swapId);
        return;
      }
      
      // Real ETH funding via blockchain
      const contract = new ethers.Contract(
        AtomicSwapContract.address,
        AtomicSwapContract.abi,
        signer
      );

      // Check if swap exists and is not already funded
      const swapDetails = await contract.getSwap(swapId);
      if (swapDetails.amount.toString() !== '0') {
        alert('❌ This swap is already funded!');
        return;
      }

      // Convert ETH amount to wei
      const amountInWei = ethers.parseEther(ethAmount.toString());
      
      // Send ETH to fund the swap
      const tx = await signer.sendTransaction({
        to: AtomicSwapContract.address,
        value: amountInWei,
        data: contract.interface.encodeFunctionData('fundSwap', [swapId])
      });

      console.log('Funding transaction sent:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Funding confirmed:', receipt);

      alert('✅ Swap funded successfully!');
      onRefresh(); // Refresh the swap list
      
    } catch (error) {
      console.error('Error funding swap:', error);
      alert('❌ Error funding swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const checkFundingStatus = async (swapId) => {
    try {
      setCheckingFunding(true);
      
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/swap/${swapId}/check-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setFundingStatus(prev => ({
          ...prev,
          [swapId]: result.data.fundingStatus
        }));
        
        if (result.data.fundingStatus.message) {
          alert(result.data.fundingStatus.message);
        }
      } else {
        alert('Error checking funding: ' + result.error);
      }
    } catch (error) {
      console.error('Error checking funding:', error);
      alert('Error checking funding: ' + error.message);
    } finally {
      setCheckingFunding(false);
    }
  };

  const simulateBtcFunding = async (swapId) => {
    try {
      setLoading(true);
      
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/swap/${swapId}/simulate-btc-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('Bitcoin funding simulated! You can now check funding status.');
        await checkFundingStatus(swapId);
      } else {
        alert('Error simulating funding: ' + result.error);
      }
    } catch (error) {
      console.error('Error simulating funding:', error);
      alert('Error simulating funding: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount, decimals = 18) => {
    try {
      return ethers.formatUnits(amount, decimals);
    } catch {
      return amount;
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'initiated': return '#ffa500';
      case 'completed': return '#00ff00';
      case 'refunded': return '#ff0000';
      default: return '#888888';
    }
  };

  const getFundingStatusDisplay = (swapId) => {
    const status = fundingStatus[swapId];
    if (!status) return null;

    return (
      <div className="funding-status" style={{ 
        padding: '10px', 
        margin: '10px 0', 
        border: '1px solid #ddd', 
        borderRadius: '5px',
        backgroundColor: status.readyForWithdrawal ? '#e8f5e8' : '#fff3cd'
      }}>
        <h4>💰 Funding Status {status.simulationMode ? '(Simulation Mode)' : '(Live Mode)'}:</h4>
        <p>ETH Funded: {status.ethFunded ? '✅ Yes' : '❌ No'}</p>
        <p>BTC Funded: {status.btcFunded ? '✅ Yes' : '❌ No'}</p>
        {status.dogeFunded !== undefined && (
          <p>DOGE Funded: {status.dogeFunded ? '✅ Yes' : '❌ No'}</p>
        )}
        <p>Ready for Withdrawal: {status.readyForWithdrawal ? '✅ Yes' : '⏳ No'}</p>
        {status.message && <p><strong>{status.message}</strong></p>}
      </div>
    );
  };

  return (
    <div className="swap-status">
      <h2>📊 Swap Status Monitor</h2>
      
      {swaps.length === 0 ? (
        <div className="no-swaps">
          <p>No active swaps found.</p>
          <p>Create a swap to see it here!</p>
        </div>
      ) : (
        <div className="swaps-grid">
          {swaps.map((swap) => (
            <div key={swap.id} className="swap-card">
              <div className="swap-header">
                <h3>🔄 {swap.type?.toUpperCase() || 'Unknown'} Swap</h3>
                <span 
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(swap.status) }}
                >
                  {swap.status || 'unknown'}
                </span>
              </div>
              
              <div className="swap-details">
                <div className="detail-row">
                  <span className="label">Swap ID:</span>
                  <span className="value">{swap.id}</span>
                </div>
                
                <div className="detail-row">
                  <span className="label">ETH Amount:</span>
                  <span className="value">{formatAmount(swap.ethAmount)} ETH</span>
                </div>
                
                {swap.btcAmount && (
                  <div className="detail-row">
                    <span className="label">BTC Amount:</span>
                    <span className="value">{swap.btcAmount} satoshis</span>
                  </div>
                )}
                
                {swap.dogeAmount && (
                  <div className="detail-row">
                    <span className="label">DOGE Amount:</span>
                    <span className="value">{swap.dogeAmount} dogeoshis</span>
                  </div>
                )}
                
                <div className="detail-row">
                  <span className="label">Timelock:</span>
                  <span className="value">{formatTimestamp(swap.timelock)}</span>
                </div>
                
                <div className="detail-row">
                  <span className="label">Hashed Secret:</span>
                  <span className="value">{swap.hashedSecret}</span>
                </div>
                
                {swap.btcSwapAddress && (
                  <div className="detail-row">
                    <span className="label">BTC Address:</span>
                    <span className="value">{swap.btcSwapAddress}</span>
                  </div>
                )}
              </div>

              {getFundingStatusDisplay(swap.id)}
              
              <div className="swap-actions">
                {swap.status !== 'completed' && swap.status !== 'refunded' && (
                  <>
                    {/* Add funding button if swap is not funded */}
                    {swap.ethAmount && parseFloat(formatAmount(swap.ethAmount)) === 0 && (
                      <button 
                        onClick={() => fundEthSwap(swap.id, swap.ethAmount)}
                        disabled={loading}
                        className="action-button fund-eth"
                      >
                        💰 Fund ETH ({formatAmount(swap.ethAmount)} ETH)
                      </button>
                    )}
                    
                    <button 
                      onClick={() => checkFundingStatus(swap.id)}
                      disabled={checkingFunding}
                      className="action-button check-funding"
                    >
                      {checkingFunding ? 'Checking...' : '💰 Check Funding'}
                    </button>
                    
                    {swap.btcSwapAddress && (
                      <button 
                        onClick={() => simulateBtcFunding(swap.id)}
                        disabled={loading}
                        className="action-button simulate-funding"
                      >
                        🔧 Simulate BTC Funding
                      </button>
                    )}
                    
                    <div className="withdraw-section">
                      <input
                        type="text"
                        placeholder="Enter secret (64 hex chars)"
                        value={selectedSwap === swap.id ? secret : ''}
                        onChange={(e) => {
                          setSecret(e.target.value);
                          setSelectedSwap(swap.id);
                        }}
                        className="secret-input"
                        maxLength={66}
                        style={{ minWidth: '500px', fontFamily: 'monospace' }}
                      />
                      <button 
                        onClick={() => withdrawSwap(swap.id)}
                        disabled={loading || !secret || selectedSwap !== swap.id}
                        className="action-button withdraw"
                      >
                        {loading ? 'Processing...' : '💎 Withdraw'}
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => refundSwap(swap.id)}
                      disabled={loading}
                      className="action-button refund"
                    >
                      🔄 Refund
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SwapStatus;