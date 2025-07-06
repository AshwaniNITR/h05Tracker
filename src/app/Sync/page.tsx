"use client";
import { useState } from 'react';
import { RefreshCw, Users, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function SyncParticipants() {
    const [isLoading, setIsLoading] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    interface LogEntry {
        message: string;
        type: 'info' | 'success' | 'error' | 'warning';
        timestamp: string;
    }

    interface SyncStatus {
        success: boolean;
        count: number;
        totalParticipants: number;
        lastProcessedIndex: number;
        timestamp: string;
        message?: string;
    }

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev: LogEntry[]) => [...prev, { message, type, timestamp }]);
    };

    const resetAndSync = async () => {
        setIsLoading(true);
        setError(null);
        setSyncStatus(null);
        setLogs([]);

        try {
            addLog('🔄 Starting sync process...', 'info');
            
            // Step 1: Reset sync state - Fixed endpoint
            addLog('📋 Resetting sync state...', 'info');
            const resetResponse = await fetch('/api/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!resetResponse.ok) {
                throw new Error(`Reset failed: ${resetResponse.status}`);
            }

            const resetData = await resetResponse.json();
            console.log('Reset response:', resetData);
            addLog('✅ Sync state reset successfully', 'success');

            // Step 2: Start sync
            addLog('🚀 Starting participant sync...', 'info');
            const syncResponse = await fetch('/api/participants', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!syncResponse.ok) {
                throw new Error(`Sync failed: ${syncResponse.status}`);
            }

            const syncData = await syncResponse.json();
            
            if (syncData.success) {
                setSyncStatus(syncData);
                addLog(`🎉 Sync completed successfully!`, 'success');
                addLog(`📊 Processed ${syncData.count} participants`, 'success');
                addLog(`📈 Total participants: ${syncData.totalParticipants}`, 'info');
                addLog(`📍 Last processed index: ${syncData.lastProcessedIndex}`, 'info');
            } else {
                throw new Error(syncData.message || 'Sync failed');
            }

        } catch (err) {
            console.error('Sync error:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            addLog(`❌ Error: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusIcon = () => {
        if (isLoading) return <RefreshCw className="animate-spin" />;
        if (error) return <XCircle className="text-red-500" />;
        if (syncStatus) return <CheckCircle className="text-green-500" />;
        return <Users />;
    };

    const getLogIcon = (type:string) => {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            default: return '📋';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <Users className="text-blue-600" />
                    Participant Sync
                </h2>
                {/* <p className="text-gray-600">
                    Sync participant data from Devfolio. This will reset any stuck sync state and fetch the latest participants.
                </p> */}
            </div>

            {/* Sync Button */}
            <div className="mb-6">
                <button
                    onClick={resetAndSync}
                    disabled={isLoading}
                    className={`
                        flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
                        ${isLoading 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                        }
                        text-white shadow-lg
                    `}
                >
                    {getStatusIcon()}
                    {isLoading ? 'Syncing...' : 'Reset & Sync Participants'}
                </button>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 text-blue-700 mb-1">
                        <Clock size={16} />
                        <span className="font-medium">Status</span>
                    </div>
                    <div className="text-blue-900">
                        {isLoading ? 'Syncing...' : error ? 'Error' : syncStatus ? 'Completed' : 'Ready'}
                    </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 text-green-700 mb-1">
                        <Users size={16} />
                        <span className="font-medium">Processed</span>
                    </div>
                    <div className="text-green-900">
                        {syncStatus ? syncStatus.count : '-'}
                    </div>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 text-purple-700 mb-1">
                        <AlertCircle size={16} />
                        <span className="font-medium">Total</span>
                    </div>
                    <div className="text-purple-900">
                        {syncStatus ? syncStatus.totalParticipants : '-'}
                    </div>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 mb-2">
                        <XCircle size={16} />
                        <span className="font-medium">Error</span>
                    </div>
                    <p className="text-red-600">{error}</p>
                </div>
            )}

            {/* Success Display */}
            {syncStatus && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 mb-2">
                        <CheckCircle size={16} />
                        <span className="font-medium">Sync Completed</span>
                    </div>
                    <div className="text-green-600 space-y-1">
                        <p>✅ Processed {syncStatus.count} participants</p>
                        <p>📊 Total participants: {syncStatus.totalParticipants}</p>
                        <p>📍 Last processed index: {syncStatus.lastProcessedIndex}</p>
                        <p>⏰ Completed at: {new Date(syncStatus.timestamp).toLocaleString()}</p>
                    </div>
                </div>
            )}

            {/* Live Logs */}
            {logs.length > 0 && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                        <h3 className="font-medium text-gray-700">Sync Logs</h3>
                    </div>
                    <div className="p-4 max-h-64 overflow-y-auto">
                        <div className="space-y-2">
                            {logs.map((log, index) => (
                                <div key={index} className="flex items-start gap-2 text-sm">
                                    <span className="text-gray-500 text-xs font-mono min-w-[60px]">
                                        {log.timestamp}
                                    </span>
                                    <span className="text-lg leading-none">
                                        {getLogIcon(log.type)}
                                    </span>
                                    <span className={`
                                        ${log.type === 'error' ? 'text-red-600' : 
                                          log.type === 'success' ? 'text-green-600' : 
                                          log.type === 'warning' ? 'text-yellow-600' : 
                                          'text-gray-700'}
                                    `}>
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}           
            </div>
        </div>
    );
}