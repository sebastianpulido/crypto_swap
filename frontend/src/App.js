import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import SwapInterface from './components/SwapInterface';
import SwapStatus from './components/SwapStatus';
import WalletConnection from './components/WalletConnection';
import FusionSwapInterface from './components/FusionSwapInterface';
import SwapBrowser from './components/SwapBrowser';
import './App.css';

function App() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [activeSwaps, setActiveSwaps] = useState([]);
  const [currentView, setCurrentView] = useState('fusion-swap');
  const [fusionMode, setFusionMode] = useState(true);
  const [acceptedSwap, setAcceptedSwap] = useState(null);

  const connectWallet = useCallback(async () => {
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
  }, []);

  const checkWalletConnection = useCallback(async () => {
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
  }, [connectWallet]);

  const fetchActiveSwaps = useCallback(async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      console.log('Fetching swaps from:', `${apiUrl}/api/swaps`);
      
      const response = await fetch(`${apiUrl}/api/swaps`);
      const data = await response.json();
      if (data.success) {
        setActiveSwaps(data.data);
        console.log('Fetched swaps:', data.data);
      }
    } catch (error) {
      console.error('Error fetching swaps:', error);
    }
  }, []);

  useEffect(() => {
    checkWalletConnection();
    fetchActiveSwaps();
    // Check if Fusion mode is enabled from environment
    const fusionEnabled = process.env.REACT_APP_FUSION_MODE === 'true';
    setFusionMode(fusionEnabled);
  }, [checkWalletConnection, fetchActiveSwaps]);

  const handleAcceptSwap = (swap) => {
    // Set the accepted swap data and switch to direct swap view
    setAcceptedSwap(swap);
    setCurrentView('direct-swap');
  };

  const handleSwapCreated = () => {
    // Clear accepted swap after creating counter-swap
    setAcceptedSwap(null);
    fetchActiveSwaps();
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>🔗 Atomic Swap Exchange</h1>
          <p>Ethereum ↔ Bitcoin ↔ Dogecoin Cross-Chain Swaps</p>
        </div>
        
        <nav className="nav-tabs">
          {fusionMode && (
            <button 
              className={currentView === 'fusion-swap' ? 'active' : ''}
              onClick={() => setCurrentView('fusion-swap')}
            >
              <span className="nav-icon">⚡</span>
              Fusion+ Swap
            </button>
          )}
          <button 
            className={currentView === 'direct-swap' ? 'active' : ''}
            onClick={() => {
              setCurrentView('direct-swap');
              setAcceptedSwap(null); // Clear any accepted swap when manually navigating
            }}
          >
            <span className="nav-icon">🔄</span>
            Create Swap
          </button>
          <button 
            className={currentView === 'browse-swaps' ? 'active' : ''}
            onClick={() => setCurrentView('browse-swaps')}
          >
            <span className="nav-icon">🔍</span>
            Browse Swaps
          </button>
          <button 
            className={currentView === 'status' ? 'active' : ''}
            onClick={() => setCurrentView('status')}
          >
            <span className="nav-icon">📊</span>
            My Swaps
          </button>
        </nav>
      </header>

      <main className="App-main">
        <WalletConnection 
          account={account}
          connectWallet={connectWallet}
        />

        {account && (
          <div className="content-container">
            {currentView === 'fusion-swap' && fusionMode && (
              <FusionSwapInterface 
                signer={signer}
                provider={provider}
                account={account}
                onSwapCreated={fetchActiveSwaps}
              />
            )}

            {currentView === 'direct-swap' && (
              <SwapInterface 
                signer={signer}
                provider={provider}
                account={account}
                onSwapCreated={handleSwapCreated}
                acceptedSwap={acceptedSwap}
              />
            )}

            {currentView === 'browse-swaps' && (
              <SwapBrowser 
                onAcceptSwap={handleAcceptSwap}
              />
            )}
            
            {currentView === 'status' && (
              <SwapStatus 
                swaps={activeSwaps}
                signer={signer}
                onRefresh={fetchActiveSwaps}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;