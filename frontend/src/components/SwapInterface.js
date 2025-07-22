import React, { useState } from 'react';
import { ethers } from 'ethers';
import AtomicSwapContract from '../contracts/AtomicSwap.json';

const SwapInterface = ({ signer, provider, account, onSwapCreated }) => {
  const [swapDirection, setSwapDirection] = useState('eth-to-btc');
  const [ethAmount, setEthAmount] = useState('');
  const [btcAmount, setBtcAmount] = useState('');
  const [btcAddress, setBtcAddress] = useState('');
  const [ethAddress, setEthAddress] = useState('');
  const [timelock, setTimelock] = useState(24); // hours
  const [loading, setLoading] = useState(false);
  const [swapResult, setSwapResult] = useState(null);

  const generateSwapId = () => {
    return ethers.hexlify(ethers.randomBytes(32));
  };

  const generateSecret = async () => {
    try {
      // Use direct URL to backend
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

  const initiateEthToBtcSwap = async () => {
    try {
      setLoading(true);
      
      // Generate secret and swap ID
      const { secret, hashedSecret } = await generateSecret();
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
        account, // participant (will be updated with actual participant)
        ethers.ZeroAddress, // ETH
        ethers.parseEther(ethAmount),
        hashedSecret,
        timelockTimestamp,
        { value: ethers.parseEther(ethAmount) }
      );

      await tx.wait();

      // Register swap with backend - use direct URL
      const response = await fetch('http://localhost:3001/api/swap/eth-to-btc/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swapId,
          ethAmount: ethers.parseEther(ethAmount).toString(),
          btcAmount,
          btcAddress,
          hashedSecret,
          timelock: timelockTimestamp
        })
      });

      const result = await response.json();
      
      setSwapResult({
        swapId,
        secret,
        hashedSecret,
        txHash: tx.hash,
        message: 'Ethereum to Bitcoin swap initiated successfully!'
      });

      onSwapCreated();
    } catch (error) {
      console.error('Error initiating swap:', error);
      alert('Error initiating swap: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const initiateBtcToEthSwap = async () => {
    try {
      setLoading(true);
      
      // Generate secret and swap ID
      const { secret, hashedSecret } = await generateSecret();
      const swapId = generateSwapId();
      const timelockTimestamp = Math.floor(Date.now() / 1000) + (timelock * 3600);

      // For Bitcoin to Ethereum, we need to create the Bitcoin script first
      const response = await fetch('http://localhost:3001/api/swap/btc-to-eth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swapId,
          btcAmount,
          ethAmount: ethers.parseEther(ethAmount).toString(),
          ethAddress: ethAddress || account,
          hashedSecret,
          timelock: timelockTimestamp,
          btcSenderPubKey: '02' + '0'.repeat(64), // Placeholder - would get from user
          btcRecipientPubKey: '03' + '0'.repeat(64) // Placeholder - would get from user
        })
      });

      const result = await response.json();
      
      setSwapResult({
        swapId,
        secret,
        hashedSecret,
        btcSwapAddress: result.data.btcSwapAddress,
        message: 'Bitcoin to Ethereum swap initiated! Please fund the Bitcoin address.'
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
    
    if (!ethAmount || !btcAmount) {
      alert('Please enter both ETH and BTC amounts');
      return;
    }

    if (swapDirection === 'eth-to-btc') {
      if (!btcAddress) {
        alert('Please enter Bitcoin address');
        return;
      }
      await initiateEthToBtcSwap();
    } else {
      await initiateBtcToEthSwap();
    }
  };

  return (
    <div className="swap-interface">
      <h2>Create New Atomic Swap</h2>
      
      <div className="swap-direction">
        <label>
          <input
            type="radio"
            value="eth-to-btc"
            checked={swapDirection === 'eth-to-btc'}
            onChange={(e) => setSwapDirection(e.target.value)}
          />
          Ethereum → Bitcoin
        </label>
        <label>
          <input
            type="radio"
            value="btc-to-eth"
            checked={swapDirection === 'btc-to-eth'}
            onChange={(e) => setSwapDirection(e.target.value)}
          />
          Bitcoin → Ethereum
        </label>
      </div>

      <form onSubmit={handleSubmit} className="swap-form">
        <div className="form-group">
          <label>ETH Amount:</label>
          <input
            type="number"
            step="0.001"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            placeholder="0.1"
            required
          />
        </div>

        <div className="form-group">
          <label>BTC Amount (satoshis):</label>
          <input
            type="number"
            value={btcAmount}
            onChange={(e) => setBtcAmount(e.target.value)}
            placeholder="1000000"
            required
          />
        </div>

        {swapDirection === 'eth-to-btc' && (
          <div className="form-group">
            <label>Bitcoin Address:</label>
            <input
              type="text"
              value={btcAddress}
              onChange={(e) => setBtcAddress(e.target.value)}
              placeholder="bc1q..."
              required
            />
          </div>
        )}

        {swapDirection === 'btc-to-eth' && (
          <div className="form-group">
            <label>Ethereum Address (optional):</label>
            <input
              type="text"
              value={ethAddress}
              onChange={(e) => setEthAddress(e.target.value)}
              placeholder={account}
            />
          </div>
        )}

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

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Creating Swap...' : 'Create Atomic Swap'}
        </button>
      </form>

      {swapResult && (
        <div className="swap-result">
          <h3>Swap Created Successfully!</h3>
          <div className="result-details">
            <p><strong>Swap ID:</strong> {swapResult.swapId}</p>
            <p><strong>Secret:</strong> <code>{swapResult.secret}</code></p>
            <p><strong>Hashed Secret:</strong> <code>{swapResult.hashedSecret}</code></p>
            {swapResult.txHash && (
              <p><strong>Transaction Hash:</strong> <code>{swapResult.txHash}</code></p>
            )}
            {swapResult.btcSwapAddress && (
              <p><strong>Bitcoin Address:</strong> <code>{swapResult.btcSwapAddress}</code></p>
            )}
            <p className="message">{swapResult.message}</p>
          </div>
          <div className="warning">
            <strong>⚠️ Important:</strong> Save the secret securely! You'll need it to complete the swap.
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapInterface;