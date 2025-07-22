import React from 'react';

const WalletConnection = ({ account, connectWallet }) => {
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="wallet-connection">
      {account ? (
        <div className="wallet-connected">
          <span className="wallet-indicator">🟢</span>
          <span>Connected: {formatAddress(account)}</span>
        </div>
      ) : (
        <button onClick={connectWallet} className="connect-wallet-btn">
          Connect Wallet
        </button>
      )}
    </div>
  );
};

export default WalletConnection;