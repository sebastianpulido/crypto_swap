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

    // Check if swap is already completed
    const currentSwap = swaps.find(s => s.id === swapId);
    if (currentSwap && currentSwap.status === 'completed') {
      alert('This swap has already been withdrawn!');
      return;
    }

    try {
      setLoading(true);
      
      const contract = new ethers.Contract(
        AtomicSwapContract.address,
        AtomicSwapContract.abi,
        signer
      );

      // First check if the swap is already withdrawn on the blockchain
      try {
        const blockchainSwap = await contract.getSwap(swapId);
        console.log('Blockchain swap status:', blockchainSwap); // Debug log
        if (blockchainSwap.withdrawn) {
          alert('This swap has already been withdrawn on the blockchain!');
          onRefresh(); // Refresh to update the UI
          return;
        }
      } catch (error) {
        console.log('Could not check swap status:', error.message);
      }

      // Format the secret properly - ensure it's a valid bytes32
      let formattedSecret = secret;
      if (!secret.startsWith('0x')) {
        formattedSecret = '0x' + secret;
      }
      
      console.log('Using secret:', formattedSecret); // Debug log
      
      // Ensure it's 32 bytes (64 hex characters + 0x)
      if (formattedSecret.length !== 66) {
        alert('Secret must be exactly 32 bytes (64 hex characters)');
        return;
      }

      console.log('Attempting withdrawal for swap:', swapId); // Debug log
      const tx = await contract.withdraw(swapId, formattedSecret);
      await tx.wait();

      alert('Swap withdrawn successfully!');
      setSecret(''); // Clear the secret input
      setSelectedSwap(''); // Clear the selected swap
      onRefresh(); // Refresh the swap list
    } catch (error) {
      console.error('Error withdrawing swap:', error);
      
      // Handle specific error cases
      if (error.message.includes('Already withdrawn')) {
        alert('This swap has already been withdrawn!');
        onRefresh(); // Refresh to update the UI
      } else if (error.message.includes('Invalid secret')) {
        alert('Invalid secret provided. Please check the secret and try again.');
      } else if (error.message.includes('Timelock expired')) {
        alert('This swap has expired and can no longer be withdrawn.');
      } else if (error.message.includes('INVALID_ARGUMENT')) {
        alert('Invalid secret format. Please ensure the secret is a valid 64-character hex string.');
      } else {
        alert('Error withdrawing swap: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const refundSwap = async (swapId) => {
    try {
      setLoading(true);
      
      const contract = new ethers.Contract(
        AtomicSwapContract.address,
        AtomicSwapContract.abi,
        signer
      );

      const tx = await contract.refund(swapId);
      await tx.wait();

      alert('Swap refunded successfully!');
      onRefresh();
    } catch (error) {
      console.error('Error refunding swap:', error);
      alert('Error refunding swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const checkFundingStatus = async (swapId) => {
    try {
      setCheckingFunding(true);
      
      const response = await fetch(`http://localhost:3001/api/swap/${swapId}/check-funding`, {
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
      
      const response = await fetch(`http://localhost:3001/api/swap/${swapId}/simulate-btc-funding`, {
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
        <h4>💰 Funding Status:</h4>
        <p>ETH Funded: {status.ethFunded ? '✅ Yes' : '❌ No'}</p>
        <p>BTC Funded: {status.btcFunded ? '✅ Yes' : '❌ No'}</p>
        <p>Ready for Withdrawal: {status.readyForWithdrawal ? '✅ Yes' : '⏳ No'}</p>
        {status.message && <p><strong>{status.message}</strong></p>}
      </div>
    );
  };

  return (
    <div className="swap-status">
      <h2>Swap Status Monitor</h2>
      
      <button onClick={onRefresh} className="refresh-btn">
        Refresh Swaps
      </button>

      {swaps.length === 0 ? (
        <p>No active swaps found.</p>
      ) : (
        <div className="swaps-list">
          {swaps.map((swap) => (
            <div key={swap.id} className="swap-card">
              <div className="swap-header">
                <h3>Swap {swap.id.substring(0, 8)}...</h3>
                <span 
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(swap.status) }}
                >
                  {swap.status}
                </span>
              </div>
              
              <div className="swap-details">
                <p><strong>Type:</strong> {swap.type}</p>
                <p><strong>ETH Amount:</strong> {formatAmount(swap.ethAmount)} ETH</p>
                <p><strong>BTC Amount:</strong> {swap.btcAmount} satoshis</p>
                <p><strong>Created:</strong> {new Date(swap.createdAt).toLocaleString()}</p>
                <p><strong>Timelock:</strong> {formatTimestamp(swap.timelock)}</p>
                
                {swap.btcAddress && (
                  <p><strong>BTC Address:</strong> <code>{swap.btcAddress}</code></p>
                )}
                
                {swap.btcSwapAddress && (
                  <p><strong>BTC Swap Address:</strong> <code>{swap.btcSwapAddress}</code></p>
                )}
                
                <p><strong>Hashed Secret:</strong> <code>{swap.hashedSecret}</code></p>
              </div>

              {/* Funding Status Display */}
              {getFundingStatusDisplay(swap.id)}

              {swap.status === 'initiated' && (
                <div className="swap-actions">
                  {/* Funding Check Buttons */}
                  <div className="funding-actions" style={{ marginBottom: '15px' }}>
                    <button
                      onClick={() => checkFundingStatus(swap.id)}
                      disabled={checkingFunding}
                      className="check-funding-btn"
                      style={{ 
                        backgroundColor: '#007bff', 
                        color: 'white', 
                        padding: '8px 16px', 
                        marginRight: '10px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {checkingFunding ? '🔍 Checking...' : '🔍 Check Funding Status'}
                    </button>
                    
                    {swap.type === 'btc-to-eth' && (
                      <button
                        onClick={() => simulateBtcFunding(swap.id)}
                        disabled={loading}
                        className="simulate-funding-btn"
                        style={{ 
                          backgroundColor: '#28a745', 
                          color: 'white', 
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {loading ? '⏳ Simulating...' : '🪙 Simulate BTC Funding'}
                      </button>
                    )}
                  </div>

                  {/* Withdrawal Actions */}
                  <div className="secret-input">
                    <input
                      type="text"
                      placeholder="Enter secret to withdraw"
                      value={selectedSwap === swap.id ? secret : ''}
                      onChange={(e) => {
                        setSelectedSwap(swap.id);
                        setSecret(e.target.value);
                      }}
                    />
                    <button
                      onClick={() => withdrawSwap(swap.id)}
                      disabled={loading || !secret}
                      className="withdraw-btn"
                    >
                      {loading ? 'Processing...' : 'Withdraw'}
                    </button>
                  </div>
                  
                  <button
                    onClick={() => refundSwap(swap.id)}
                    disabled={loading}
                    className="refund-btn"
                  >
                    {loading ? 'Processing...' : 'Refund (if expired)'}
                  </button>
                </div>
              )}

              {swap.completionTxHash && (
                <p><strong>Completion Tx:</strong> <code>{swap.completionTxHash}</code></p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SwapStatus;