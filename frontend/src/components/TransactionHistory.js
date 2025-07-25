import React, { useState, useEffect } from 'react';

const TransactionHistory = ({ account }) => {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadTransactions();
  }, [account]);

  const loadTransactions = () => {
    if (!account) return;
    
    const storageKey = `swapHistory_${account}`;
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Sort by timestamp, newest first
        const sorted = parsed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setTransactions(sorted);
      } catch (error) {
        console.error('Error loading transaction history:', error);
        setTransactions([]);
      }
    }
  };

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear all transaction history?')) {
      const storageKey = `swapHistory_${account}`;
      localStorage.removeItem(storageKey);
      setTransactions([]);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${label} copied to clipboard!`);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatAmount = (amount, currency) => {
    if (currency === 'ETH') {
      return `${parseFloat(amount).toFixed(6)} ETH`;
    } else if (currency === 'BTC') {
      return `${(amount / 100000000).toFixed(8)} BTC`;
    } else if (currency === 'DOGE') {
      return `${(amount / 100000000).toFixed(8)} DOGE`;
    }
    return `${amount} ${currency}`;
  };

  const getSwapTypeLabel = (type) => {
    const labels = {
      'eth-to-btc': 'ETH → BTC',
      'btc-to-eth': 'BTC → ETH',
      'eth-to-doge': 'ETH → DOGE',
      'doge-to-eth': 'DOGE → ETH'
    };
    return labels[type] || type;
  };

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    if (filter === 'initiated') return tx.type === 'swap_created';
    if (filter === 'counter') return tx.type === 'counter_swap_created';
    return true;
  });

  if (!account) {
    return (
      <div className="transaction-history">
        <h2>📋 Transaction History</h2>
        <p>Please connect your wallet to view transaction history.</p>
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <div className="history-header">
        <h2>📋 Transaction History</h2>
        <div className="history-controls">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Transactions</option>
            <option value="initiated">Initiated Swaps</option>
            <option value="counter">Counter Swaps</option>
          </select>
          {transactions.length > 0 && (
            <button onClick={clearHistory} className="clear-history-btn">
              🗑️ Clear History
            </button>
          )}
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="no-transactions">
          <p>No transaction history found.</p>
          <p>Create some swaps to see them here!</p>
        </div>
      ) : (
        <div className="transactions-list">
          {filteredTransactions.map((tx, index) => (
            <div key={index} className="transaction-card">
              <div className="transaction-header">
                <div className="transaction-type">
                  <span className={`type-badge ${tx.type}`}>
                    {tx.type === 'counter_swap_created' ? '🎯 Counter Swap' : '🔄 Swap Created'}
                  </span>
                  <span className="swap-direction">{getSwapTypeLabel(tx.swapDirection)}</span>
                </div>
                <div className="transaction-date">
                  {formatDate(tx.timestamp)}
                </div>
              </div>

              <div className="transaction-details">
                <div className="detail-row">
                  <span className="label">Swap ID:</span>
                  <span className="value clickable" onClick={() => copyToClipboard(tx.swapId, 'Swap ID')}>
                    {tx.swapId.slice(0, 10)}...{tx.swapId.slice(-8)} 📋
                  </span>
                </div>

                {tx.secret && (
                  <div className="detail-row">
                    <span className="label">Secret:</span>
                    <span className="value clickable" onClick={() => copyToClipboard(tx.secret, 'Secret')}>
                      {tx.secret.slice(0, 10)}...{tx.secret.slice(-8)} 📋
                    </span>
                  </div>
                )}

                <div className="detail-row">
                  <span className="label">Hashed Secret:</span>
                  <span className="value clickable" onClick={() => copyToClipboard(tx.hashedSecret, 'Hashed Secret')}>
                    {tx.hashedSecret.slice(0, 10)}...{tx.hashedSecret.slice(-8)} 📋
                  </span>
                </div>

                {tx.txHash && (
                  <div className="detail-row">
                    <span className="label">Transaction Hash:</span>
                    <span className="value clickable" onClick={() => copyToClipboard(tx.txHash, 'Transaction Hash')}>
                      {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)} 📋
                    </span>
                  </div>
                )}

                <div className="amounts-row">
                  <div className="amount-item">
                    <span className="label">ETH Amount:</span>
                    <span className="value">{formatAmount(tx.ethAmount, 'ETH')}</span>
                  </div>
                  <div className="amount-item">
                    <span className="label">Crypto Amount:</span>
                    <span className="value">{formatAmount(tx.cryptoAmount, tx.cryptoType?.toUpperCase())}</span>
                  </div>
                </div>

                {tx.cryptoAddress && (
                  <div className="detail-row">
                    <span className="label">{tx.cryptoType?.toUpperCase()} Address:</span>
                    <span className="value clickable" onClick={() => copyToClipboard(tx.cryptoAddress, `${tx.cryptoType?.toUpperCase()} Address`)}>
                      {tx.cryptoAddress.slice(0, 10)}...{tx.cryptoAddress.slice(-8)} 📋
                    </span>
                  </div>
                )}

                {tx.btcSwapAddress && (
                  <div className="detail-row">
                    <span className="label">BTC Swap Address:</span>
                    <span className="value clickable" onClick={() => copyToClipboard(tx.btcSwapAddress, 'BTC Swap Address')}>
                      {tx.btcSwapAddress.slice(0, 10)}...{tx.btcSwapAddress.slice(-8)} 📋
                    </span>
                  </div>
                )}

                {tx.dogeSwapAddress && (
                  <div className="detail-row">
                    <span className="label">DOGE Swap Address:</span>
                    <span className="value clickable" onClick={() => copyToClipboard(tx.dogeSwapAddress, 'DOGE Swap Address')}>
                      {tx.dogeSwapAddress.slice(0, 10)}...{tx.dogeSwapAddress.slice(-8)} 📋
                    </span>
                  </div>
                )}

                <div className="transaction-message">
                  <p>{tx.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;