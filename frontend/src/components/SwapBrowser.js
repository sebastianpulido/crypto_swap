import React, { useState, useEffect } from 'react';

const SwapBrowser = ({ onAcceptSwap }) => {
    const [availableSwaps, setAvailableSwaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchAvailableSwaps();
        // Refresh every 10 seconds
        const interval = setInterval(fetchAvailableSwaps, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchAvailableSwaps = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/swaps');
            const result = await response.json();
            
            if (result.success) {
                // Filter out completed swaps and show only open ones
                const openSwaps = result.data.filter(swap => 
                    swap.status === 'initiated' && 
                    swap.createdAt > Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
                );
                setAvailableSwaps(openSwaps);
            } else {
                setError('Failed to fetch swaps');
            }
        } catch (err) {
            setError('Network error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptSwap = (swap) => {
        if (onAcceptSwap) {
            onAcceptSwap(swap);
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    const formatAmount = (amount, currency) => {
        if (currency === 'ETH') {
            // Convert from Wei to ETH (divide by 10^18)
            const ethAmount = parseFloat(amount) / Math.pow(10, 18);
            return `${ethAmount.toFixed(6)} ETH`;
        } else if (currency === 'BTC') {
            // Convert from satoshis to BTC (divide by 10^8)
            return `${(amount / 100000000).toFixed(8)} BTC`;
        }
        return `${amount} ${currency}`;
    };

    if (loading) {
        return <div className="text-center">Loading available swaps...</div>;
    }

    if (error) {
        return <div className="text-red-500">Error: {error}</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h2 className="text-2xl font-bold mb-6">🔄 Available Atomic Swaps</h2>
            
            <div className="mb-4">
                <button 
                    onClick={fetchAvailableSwaps}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                    🔄 Refresh
                </button>
                <span className="ml-4 text-gray-600">
                    {availableSwaps.length} swap(s) available
                </span>
            </div>

            {availableSwaps.length === 0 ? (
                <div className="text-center py-8 bg-gray-100 rounded">
                    <p className="text-gray-600">No active swaps available</p>
                    <p className="text-sm text-gray-500 mt-2">
                        Create a swap to see it listed here for others to accept
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {availableSwaps.map((swap) => (
                        <div key={swap.id} className="border rounded-lg p-6 bg-white shadow">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center mb-2">
                                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                                            {swap.type.toUpperCase()}
                                        </span>
                                        <span className="ml-2 text-gray-500 text-sm">
                                            ID: {swap.id.substring(0, 10)}...
                                        </span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Offering:</p>
                                            <p className="font-semibold">
                                                {swap.type === 'btc-to-eth' 
                                                    ? formatAmount(swap.btcAmount, 'BTC')
                                                    : formatAmount(swap.ethAmount, 'ETH')
                                                }
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Requesting:</p>
                                            <p className="font-semibold">
                                                {swap.type === 'btc-to-eth' 
                                                    ? formatAmount(swap.ethAmount, 'ETH')
                                                    : formatAmount(swap.btcAmount, 'BTC')
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-sm text-gray-600 space-y-1">
                                        <p>Created: {formatTime(swap.createdAt)}</p>
                                        <p>Expires: {formatTime(swap.timelock * 1000)}</p>
                                        {swap.type === 'btc-to-eth' && (
                                            <p>BTC Address: <code className="bg-gray-100 px-1 rounded">{swap.btcSwapAddress}</code></p>
                                        )}
                                    </div>
                                </div>

                                <div className="ml-4">
                                    <button
                                        onClick={() => handleAcceptSwap(swap)}
                                        className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 font-medium"
                                    >
                                        ✅ Accept Swap
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
                <h3 className="font-semibold text-yellow-800 mb-2">⚠️ How Atomic Swaps Work:</h3>
                <ol className="text-sm text-yellow-700 space-y-1">
                    <li>1. <strong>Initiator</strong> creates a swap (like the one you created)</li>
                    <li>2. <strong>Acceptor</strong> sees it here and clicks "Accept Swap"</li>
                    <li>3. <strong>Both parties</strong> fund their respective addresses</li>
                    <li>4. <strong>One party</strong> withdraws first (revealing the secret)</li>
                    <li>5. <strong>Other party</strong> uses the secret to complete their withdrawal</li>
                </ol>
            </div>
        </div>
    );
};

export default SwapBrowser;