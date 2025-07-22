import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import SwapInterface from './components/SwapInterface';
import SwapStatus from './components/SwapStatus';
import WalletConnection from './components/WalletConnection';
import './App.css';

function App() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [activeSwaps, setActiveSwaps] = useState([]);
  const [currentView, setCurrentView] = useState('swap');

  useEffect(() => {
    checkWalletConnection();
    fetchActiveSwaps();
  }, []);

  const checkWalletConnection = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          connectWallet();
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      }
    }
  };

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        setProvider(provider);
        setSigner(signer);
        setAccount(address);
      } catch (error) {
        console.error('Error connecting wallet:', error);
      }
    } else {
      alert('Please install MetaMask to use this application');
    }
  };

  const fetchActiveSwaps = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/swaps`);
      const data = await response.json();
      if (data.success) {
        setActiveSwaps(data.data);
      }
    } catch (error) {
      console.error('Error fetching swaps:', error);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>1inch Cross-Chain Swap (Fusion+)</h1>
        <p>Ethereum ↔ Bitcoin Atomic Swaps</p>
        
        <nav className="nav-tabs">
          <button 
            className={currentView === 'swap' ? 'active' : ''}
            onClick={() => setCurrentView('swap')}
          >
            New Swap
          </button>
          <button 
            className={currentView === 'status' ? 'active' : ''}
            onClick={() => setCurrentView('status')}
          >
            Swap Status
          </button>
        </nav>
      </header>

      <main className="App-main">
        <WalletConnection 
          account={account}
          connectWallet={connectWallet}
        />

        {account && (
          <>
            {currentView === 'swap' && (
              <SwapInterface 
                signer={signer}
                provider={provider}
                account={account}
                onSwapCreated={fetchActiveSwaps}
              />
            )}
            
            {currentView === 'status' && (
              <SwapStatus 
                swaps={activeSwaps}
                signer={signer}
                onRefresh={fetchActiveSwaps}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;