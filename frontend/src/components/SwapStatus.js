import React, { useState } from 'react';
import { ethers } from 'ethers';
import AtomicSwapContract from '../contracts/AtomicSwap.json';

const SwapStatus = ({ swaps, signer, onRefresh }) => {
  const [selectedSwap, setSelectedSwap] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);

  const withdrawSwap = async (swapId) => {
    if (!secret) {
      alert('Please enter the secret');
      return;
    }

    try {
      setLoading(true);
      
      const contract = new ethers.Contract(
        AtomicSwapContract.address,
        AtomicSwapContract.abi,
        signer
      );

      const tx = await contract.withdraw(swapId, secret);
      await tx.wait();

      alert('Swap withdrawn successfully!');
      onRefresh();
    } catch (error) {
      console.error('Error withdrawing swap:', error);
      alert('Error withdrawing swap: ' + error.message);
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

              {swap.status === 'initiated' && (
                <div className="swap-actions">
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