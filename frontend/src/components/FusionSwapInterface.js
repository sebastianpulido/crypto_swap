import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const FusionSwapInterface = ({ signer, provider, account, onSwapCreated }) => {
  const [fromChain, setFromChain] = useState('ethereum');
  const [toChain, setToChain] = useState('bitcoin');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [timelock, setTimelock] = useState(24);
  const [loading, setLoading] = useState(false);
  const [swapResult, setSwapResult] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);

  const supportedChains = {
    ethereum: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
    bitcoin: { name: 'Bitcoin', symbol: 'BTC', decimals: 8 },
    dogecoin: { name: 'Dogecoin', symbol: 'DOGE', decimals: 8 }
  };

  useEffect(() => {
    if (fromAmount && fromChain && toChain) {
      fetchExchangeRate();
    }
  }, [fromAmount, fromChain, toChain]);

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/fusion/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChain,
          toChain,
          fromAmount
        })
      });
      const data = await response.json();
      if (data.success) {
        setExchangeRate(data.data.rate);
        setToAmount(data.data.toAmount);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  };

  const createFusionIntent = async () => {
    try {
      setLoading(true);

      // Create Fusion+ intent
      const response = await fetch('http://localhost:3001/api/fusion/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChain,
          toChain,
          fromAmount,
          toAmount,
          fromAddress: account,
          toAddress: recipientAddress,
          timelock: timelock * 3600 // Convert hours to seconds
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setSwapResult({
          intentId: result.data.intentId,
          swapId: result.data.swapId,
          fromChain,
          toChain,
          fromAmount,
          toAmount,
          status: 'created',
          message: `Fusion+ intent created! Intent ID: ${result.data.intentId}`
        });

        onSwapCreated();
      } else {
        throw new Error(result.error || 'Failed to create Fusion+ intent');
      }
    } catch (error) {
      console.error('Error creating Fusion+ intent:', error);
      alert('Error creating Fusion+ intent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!fromAmount || !toAmount) {
      alert('Please enter valid amounts');
      return;
    }

    if (!recipientAddress) {
      alert('Please enter recipient address');
      return;
    }

    await createFusionIntent();
  };

  const getAddressPlaceholder = (chain) => {
    switch (chain) {
      case 'ethereum':
        return '0x...';
      case 'bitcoin':
        return 'bc1q... or 1...';
      case 'dogecoin':
        return 'D... or A...';
      default:
        return '';
    }
  };

  return (
    <div className="fusion-swap-interface">
      <h2>1inch Fusion+ Cross-Chain Swap</h2>
      <p className="fusion-description">
        Create gasless, MEV-protected cross-chain swaps using 1inch Fusion+ technology
      </p>
      
      <form onSubmit={handleSubmit} className="fusion-swap-form">
        <div className="chain-selection">
          <div className="form-group">
            <label>From Chain:</label>
            <select 
              value={fromChain} 
              onChange={(e) => setFromChain(e.target.value)}
            >
              {Object.entries(supportedChains).map(([key, chain]) => (
                <option key={key} value={key}>
                  {chain.name} ({chain.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="swap-arrow">↔</div>

          <div className="form-group">
            <label>To Chain:</label>
            <select 
              value={toChain} 
              onChange={(e) => setToChain(e.target.value)}
            >
              {Object.entries(supportedChains)
                .filter(([key]) => key !== fromChain)
                .map(([key, chain]) => (
                <option key={key} value={key}>
                  {chain.name} ({chain.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="amount-section">
          <div className="form-group">
            <label>From Amount ({supportedChains[fromChain].symbol}):</label>
            <input
              type="number"
              step="0.00000001"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              placeholder={`0.1 ${supportedChains[fromChain].symbol}`}
              required
            />
          </div>

          <div className="form-group">
            <label>To Amount ({supportedChains[toChain].symbol}):</label>
            <input
              type="number"
              step="0.00000001"
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
              placeholder={`Estimated ${supportedChains[toChain].symbol}`}
              readOnly
            />
            {exchangeRate && (
              <small className="exchange-rate">
                Rate: 1 {supportedChains[fromChain].symbol} = {exchangeRate} {supportedChains[toChain].symbol}
              </small>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Recipient Address ({supportedChains[toChain].name}):</label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder={getAddressPlaceholder(toChain)}
            required
          />
        </div>

        <div className="form-group">
          <label>Timelock (hours):</label>
          <input
            type="number"
            min="1"
            max="168"
            value={timelock}
            onChange={(e) => setTimelock(e.target.value)}
            required
          />
        </div>

        <div className="fusion-features">
          <div className="feature">✅ Gasless transactions</div>
          <div className="feature">✅ MEV protection</div>
          <div className="feature">✅ Self-custody</div>
          <div className="feature">✅ Intent-based execution</div>
        </div>

        <button type="submit" disabled={loading} className="fusion-submit-btn">
          {loading ? 'Creating Fusion+ Intent...' : 'Create Fusion+ Swap'}
        </button>
      </form>

      {swapResult && (
        <div className="fusion-result">
          <h3>Fusion+ Intent Created!</h3>
          <div className="result-details">
            <p><strong>Intent ID:</strong> <code>{swapResult.intentId}</code></p>
            <p><strong>Swap ID:</strong> <code>{swapResult.swapId}</code></p>
            <p><strong>From:</strong> {fromAmount} {supportedChains[fromChain].symbol} ({supportedChains[fromChain].name})</p>
            <p><strong>To:</strong> {toAmount} {supportedChains[toChain].symbol} ({supportedChains[toChain].name})</p>
            <p><strong>Status:</strong> <span className="status-created">Created</span></p>
            <p className="message">{swapResult.message}</p>
          </div>
          <div className="fusion-info">
            <strong>ℹ️ Next Steps:</strong>
            <ul>
              <li>Your intent has been submitted to the 1inch Fusion+ network</li>
              <li>Resolvers will compete to fulfill your swap</li>
              <li>You'll receive notifications when the swap is executed</li>
              <li>Check the "Swap Status" tab to monitor progress</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default FusionSwapInterface;