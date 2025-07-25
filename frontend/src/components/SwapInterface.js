import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import AtomicSwapContract from '../contracts/AtomicSwap.json';

const SwapInterface = ({ signer, provider, account, onSwapCreated, acceptedSwap = null }) => {
  const [swapDirection, setSwapDirection] = useState('eth-to-btc');
  const [ethAmount, setEthAmount] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoAddress, setCryptoAddress] = useState('');
  const [ethAddress, setEthAddress] = useState('');
  const [timelock, setTimelock] = useState(24); // hours
  const [loading, setLoading] = useState(false);
  const [swapResult, setSwapResult] = useState(null);
  const [useCustomHashedSecret, setUseCustomHashedSecret] = useState(false);
  const [customHashedSecret, setCustomHashedSecret] = useState('');
  const [isAcceptingSwap, setIsAcceptingSwap] = useState(false);

  const swapOptions = {
    'eth-to-btc': { label: 'Ethereum → Bitcoin', crypto: 'BTC', unit: 'satoshis' },
    'btc-to-eth': { label: 'Bitcoin → Ethereum', crypto: 'BTC', unit: 'satoshis' },
    'eth-to-doge': { label: 'Ethereum → Dogecoin', crypto: 'DOGE', unit: 'dogeoshis' },
    'doge-to-eth': { label: 'Dogecoin → Ethereum', crypto: 'DOGE', unit: 'dogeoshis' }
  };

  // Auto-populate fields when accepting a swap
  useEffect(() => {
    if (acceptedSwap) {
      setIsAcceptingSwap(true);
      
      // Determine the counter-swap direction
      const counterDirection = getCounterSwapDirection(acceptedSwap.type);
      setSwapDirection(counterDirection);
      
      // Set amounts (convert ETH from Wei to Ether for display)
      const ethAmountInEther = ethers.formatEther(acceptedSwap.ethAmount);
      setEthAmount(ethAmountInEther);
      setCryptoAmount(acceptedSwap.btcAmount || acceptedSwap.dogeAmount || '');
      
      // Set the hashed secret from the original swap
      setUseCustomHashedSecret(true);
      setCustomHashedSecret(acceptedSwap.hashedSecret);
      
      // Set timelock to match original (convert from timestamp to hours remaining)
      const hoursRemaining = Math.max(1, Math.ceil((acceptedSwap.timelock * 1000 - Date.now()) / (1000 * 60 * 60)));
      setTimelock(hoursRemaining);
      
      // Set addresses if available
      if (acceptedSwap.btcAddress) {
        setCryptoAddress(acceptedSwap.btcAddress);
      }
      if (acceptedSwap.ethAddress) {
        setEthAddress(acceptedSwap.ethAddress);
      }
    }
  }, [acceptedSwap]);

  const getCounterSwapDirection = (originalType) => {
    const counterMap = {
      'eth-to-btc': 'btc-to-eth',
      'btc-to-eth': 'eth-to-btc',
      'eth-to-doge': 'doge-to-eth',
      'doge-to-eth': 'eth-to-doge'
    };
    return counterMap[originalType] || 'eth-to-btc';
  };

  // Function to save transaction to localStorage
  const saveTransactionToHistory = (transactionData) => {
    if (!account) return;
    
    const storageKey = `swapHistory_${account}`;
    const existing = localStorage.getItem(storageKey);
    let transactions = [];
    
    if (existing) {
      try {
        transactions = JSON.parse(existing);
      } catch (error) {
        console.error('Error parsing existing transactions:', error);
        transactions = [];
      }
    }
    
    // Add new transaction
    transactions.push({
      ...transactionData,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 transactions to prevent localStorage bloat
    if (transactions.length > 50) {
      transactions = transactions.slice(-50);
    }
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(transactions));
    } catch (error) {
      console.error('Error saving transaction to localStorage:', error);
    }
  };

  const formatAmount = (amount, currency) => {
    if (currency === 'ETH') {
      const ethAmount = parseFloat(amount) / Math.pow(10, 18);
      return `${ethAmount.toFixed(6)} ETH`;
    } else if (currency === 'BTC') {
      return `${(amount / 100000000).toFixed(8)} BTC`;
    }
    return `${amount} ${currency}`;
  };

  const generateSwapId = () => {
    return ethers.hexlify(ethers.randomBytes(32));
  };

  const generateSecret = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/generate-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error generating secret:', error);
      throw error;
    }
  };

  const initiateEthToCryptoSwap = async (cryptoType) => {
    try {
      setLoading(true);
      
      let secret, hashedSecret;
      
      if (useCustomHashedSecret && customHashedSecret) {
        hashedSecret = customHashedSecret;
        secret = null; // We don't know the secret when using custom hashed secret
      } else {
        const secretData = await generateSecret();
        secret = secretData.secret;
        hashedSecret = secretData.hashedSecret;
      }
      
      const swapId = generateSwapId();
      const timelockTimestamp = Math.floor(Date.now() / 1000) + (timelock * 3600);

      // Initialize contract
      const contract = new ethers.Contract(
        AtomicSwapContract.address,
        AtomicSwapContract.abi,
        signer
      );

      // Initiate swap on Ethereum
      const tx = await contract.initiateSwap(
        swapId,
        account,
        ethers.ZeroAddress, // ETH
        ethers.parseEther(ethAmount),
        hashedSecret,
        timelockTimestamp,
        { value: ethers.parseEther(ethAmount) }
      );

      await tx.wait();

      // Register swap with backend
      const endpoint = cryptoType === 'btc' ? 'eth-to-btc' : 'eth-to-doge';
      await fetch(`http://localhost:3001/api/swap/${endpoint}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swapId,
          ethAmount: ethers.parseEther(ethAmount).toString(),
          [cryptoType + 'Amount']: cryptoAmount,
          [cryptoType + 'Address']: cryptoAddress,
          hashedSecret,
          timelock: timelockTimestamp
        })
      });

      const resultMessage = isAcceptingSwap 
        ? `✅ Counter-swap created! You've accepted the atomic swap.`
        : `Ethereum to ${cryptoType.toUpperCase()} swap initiated successfully!`;
      
      setSwapResult({
        swapId,
        secret,
        hashedSecret,
        txHash: tx.hash,
        message: resultMessage
      });

      // Save to transaction history
      saveTransactionToHistory({
        type: isAcceptingSwap ? 'counter_swap_created' : 'swap_created',
        swapId,
        secret,
        hashedSecret,
        txHash: tx.hash,
        swapDirection,
        ethAmount,
        cryptoAmount,
        cryptoType,
        cryptoAddress,
        message: resultMessage
      });

      onSwapCreated();
    } catch (error) {
      console.error('Error initiating swap:', error);
      alert('Error initiating swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const initiateCryptoToEthSwap = async (cryptoType) => {
    try {
      setLoading(true);
      
      let secret, hashedSecret;
      
      if (useCustomHashedSecret && customHashedSecret) {
        hashedSecret = customHashedSecret;
        secret = null; // We don't know the secret when using custom hashed secret
      } else {
        const secretData = await generateSecret();
        secret = secretData.secret;
        hashedSecret = secretData.hashedSecret;
      }
      
      const swapId = generateSwapId();
      const timelockTimestamp = Math.floor(Date.now() / 1000) + (timelock * 3600);

      const endpoint = cryptoType === 'btc' ? 'btc-to-eth' : 'doge-to-eth';
      const response = await fetch(`http://localhost:3001/api/swap/${endpoint}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swapId,
          [cryptoType + 'Amount']: cryptoAmount,
          ethAmount: ethers.parseEther(ethAmount).toString(),
          ethAddress: ethAddress || account,
          hashedSecret,
          timelock: timelockTimestamp,
          [cryptoType + 'SenderPubKey']: '02' + '0'.repeat(64), // Placeholder
          [cryptoType + 'RecipientPubKey']: '03' + '0'.repeat(64) // Placeholder
        })
      });

      const result = await response.json();

      const resultMessage = isAcceptingSwap 
        ? `✅ Counter-swap created! Please fund the ${cryptoType.toUpperCase()} address to complete the atomic swap.`
        : `${cryptoType.toUpperCase()} to Ethereum swap initiated! Please fund the ${cryptoType.toUpperCase()} address.`;
      
      setSwapResult({
        swapId,
        secret,
        hashedSecret,
        [cryptoType + 'SwapAddress']: result.data[cryptoType + 'SwapAddress'],
        message: resultMessage
      });

      // Save to transaction history
      saveTransactionToHistory({
        type: isAcceptingSwap ? 'counter_swap_created' : 'swap_created',
        swapId,
        secret,
        hashedSecret,
        swapDirection,
        ethAmount,
        cryptoAmount,
        cryptoType,
        [cryptoType + 'SwapAddress']: result.data[cryptoType + 'SwapAddress'],
        message: resultMessage
      });

      onSwapCreated();
    } catch (error) {
      console.error('Error initiating swap:', error);
      alert('Error initiating swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!ethAmount || !cryptoAmount) {
      alert('Please enter both ETH and crypto amounts');
      return;
    }

    if (useCustomHashedSecret && !customHashedSecret) {
      alert('Please enter the hashed secret or uncheck the custom option');
      return;
    }

    const [fromChain, toChain] = swapDirection.split('-to-');
    
    if (fromChain === 'eth') {
      if (!cryptoAddress) {
        alert(`Please enter ${toChain.toUpperCase()} address`);
        return;
      }
      await initiateEthToCryptoSwap(toChain);
    } else {
      await initiateCryptoToEthSwap(fromChain);
    }
  };

  const currentOption = swapOptions[swapDirection];

  return (
    <div className="swap-interface">
      {isAcceptingSwap && acceptedSwap && (
        <div className="accepting-swap-header">
          <h2>🎯 Accepting Atomic Swap</h2>
          <div className="original-swap-info">
            <h3>Original Swap Details:</h3>
            <div className="swap-details-grid">
              <div className="detail-item">
                <span className="label">Type:</span>
                <span className="value">{acceptedSwap.type.toUpperCase()}</span>
              </div>
              <div className="detail-item">
                <span className="label">ETH Amount:</span>
                <span className="value">{formatAmount(acceptedSwap.ethAmount, 'ETH')}</span>
              </div>
              <div className="detail-item">
                <span className="label">BTC Amount:</span>
                <span className="value">{formatAmount(acceptedSwap.btcAmount || acceptedSwap.dogeAmount, 'BTC')}</span>
              </div>
              <div className="detail-item">
                <span className="label">Expires:</span>
                <span className="value">{new Date(acceptedSwap.timelock * 1000).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <p className="counter-swap-description">
            Creating the counter-swap with matching parameters and the same hashed secret to complete the atomic swap.
          </p>
        </div>
      )}

      {!isAcceptingSwap && (
        <>
          <h2>🔄 Create Atomic Swap</h2>
          <p className="direct-description">
            Create direct peer-to-peer atomic swaps without intermediaries
          </p>
        </>
      )}
      
      <div className="swap-direction">
        {Object.entries(swapOptions).map(([key, option]) => (
          <label key={key} className={swapDirection === key ? 'selected' : ''}>
            <input
              type="radio"
              value={key}
              checked={swapDirection === key}
              onChange={(e) => setSwapDirection(e.target.value)}
              disabled={isAcceptingSwap}
            />
            <span className="radio-label">{option.label}</span>
          </label>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="swap-form">
        <div className="form-row">
          <div className="form-group">
            <label>ETH Amount:</label>
            <input
              type="number"
              step="0.001"
              value={ethAmount}
              onChange={(e) => setEthAmount(e.target.value)}
              placeholder="0.1"
              required
              disabled={isAcceptingSwap}
              className={isAcceptingSwap ? 'disabled' : ''}
            />
          </div>

          <div className="form-group">
            <label>{currentOption.crypto} Amount ({currentOption.unit}):</label>
            <input
              type="number"
              value={cryptoAmount}
              onChange={(e) => setCryptoAmount(e.target.value)}
              placeholder={currentOption.crypto === 'BTC' ? "1000000" : "100000000"}
              required
              disabled={isAcceptingSwap}
              className={isAcceptingSwap ? 'disabled' : ''}
            />
          </div>
        </div>

        {swapDirection.startsWith('eth-to-') && (
          <div className="form-group">
            <label>{currentOption.crypto} Address:</label>
            <input
              type="text"
              value={cryptoAddress}
              onChange={(e) => setCryptoAddress(e.target.value)}
              placeholder={currentOption.crypto === 'BTC' ? "bc1q..." : "D..."}
              required
              disabled={isAcceptingSwap && cryptoAddress}
              className={isAcceptingSwap && cryptoAddress ? 'disabled' : ''}
            />
          </div>
        )}

        {swapDirection.endsWith('-to-eth') && (
          <div className="form-group">
            <label>Ethereum Address (optional):</label>
            <input
              type="text"
              value={ethAddress}
              onChange={(e) => setEthAddress(e.target.value)}
              placeholder={account}
              disabled={isAcceptingSwap}
              className={isAcceptingSwap ? 'disabled' : ''}
            />
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Timelock (hours):</label>
            <input
              type="number"
              min="1"
              max="168"
              value={timelock}
              onChange={(e) => setTimelock(e.target.value)}
              disabled={isAcceptingSwap}
              className={isAcceptingSwap ? 'disabled' : ''}
            />
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useCustomHashedSecret}
                onChange={(e) => setUseCustomHashedSecret(e.target.checked)}
                disabled={isAcceptingSwap}
              />
              Use Custom Hashed Secret
            </label>
          </div>
        </div>

        {useCustomHashedSecret && (
          <div className="form-group">
            <label>Hashed Secret (32 bytes hex):</label>
            <input
              type="text"
              value={customHashedSecret}
              onChange={(e) => setCustomHashedSecret(e.target.value)}
              placeholder="0x..."
              disabled={isAcceptingSwap}
              className={isAcceptingSwap ? 'disabled' : ''}
            />
          </div>
        )}

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? 'Creating Swap...' : (isAcceptingSwap ? 'Create Counter-Swap' : 'Create Swap')}
        </button>
      </form>

      {swapResult && (
        <div className="swap-result">
          <h3>{isAcceptingSwap ? '🎯 Counter-Swap Created!' : '✅ Swap Created Successfully!'}</h3>
          <div className="result-details">
            <div className="result-item">
              <span className="label">Swap ID:</span>
              <span className="value">{swapResult.swapId}</span>
            </div>
            {swapResult.secret && (
              <div className="result-item">
                <span className="label">Secret:</span>
                <span className="value">{swapResult.secret}</span>
              </div>
            )}
            <div className="result-item">
              <span className="label">Hashed Secret:</span>
              <span className="value">{swapResult.hashedSecret}</span>
            </div>
            {swapResult.txHash && (
              <div className="result-item">
                <span className="label">Transaction Hash:</span>
                <span className="value">{swapResult.txHash}</span>
              </div>
            )}
            {swapResult.btcSwapAddress && (
              <div className="result-item">
                <span className="label">BTC Swap Address:</span>
                <span className="value">{swapResult.btcSwapAddress}</span>
              </div>
            )}
            {swapResult.dogeSwapAddress && (
              <div className="result-item">
                <span className="label">DOGE Swap Address:</span>
                <span className="value">{swapResult.dogeSwapAddress}</span>
              </div>
            )}
          </div>
          <p className="result-message">{swapResult.message}</p>
          <div className="result-note">
            <p>💡 <strong>Important:</strong> This information has been saved to your transaction history. You can view it anytime in the "Transaction History" tab.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapInterface;