"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Users, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw } from 'lucide-react';

export default function SyncParticipants() {
    const router = useRouter();
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
        syncType: string;
        count: number;
        newParticipants: number;
        updatedParticipants: number;
        skippedParticipants: number;
        failedParticipants: number;
        failedUsernames: string[];
        totalParticipants: number;
        lastProcessedIndex: number;
        initialDBCount: number;
        finalDBCount: number;
        progress: string;
        isComplete: boolean;
        timestamp: string;
        message?: string;
    }

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev: LogEntry[]) => [...prev, { message, type, timestamp }]);
    };

    const incrementalSync = async () => {
        setIsLoading(true);
        setError(null);
        setSyncStatus(null);
        setLogs([]);

        try {
            addLog('🔄 Starting incremental sync...', 'info');
            
            // Direct sync without reset - let backend handle incremental logic
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
                
                // Log sync type and results
                addLog(`📊 Sync Type: ${syncData.syncType}`, 'info');
                
                if (syncData.count > 0) {
                    addLog(`🎉 Sync completed successfully!`, 'success');
                    addLog(`📊 Total processed: ${syncData.count} participants`, 'success');
                    
                    if (syncData.newParticipants > 0) {
                        addLog(`🆕 New participants: ${syncData.newParticipants}`, 'success');
                    }
                    
                    if (syncData.updatedParticipants > 0) {
                        addLog(`🔄 Updated participants: ${syncData.updatedParticipants}`, 'success');
                    }
                    
                    if (syncData.skippedParticipants > 0) {
                        addLog(`⏭️ Skipped participants: ${syncData.skippedParticipants}`, 'warning');
                    }
                    
                    if (syncData.failedParticipants > 0) {
                        addLog(`❌ Failed participants: ${syncData.failedParticipants}`, 'error');
                        if (syncData.failedUsernames && syncData.failedUsernames.length > 0) {
                            addLog(`Failed usernames: ${syncData.failedUsernames.join(', ')}`, 'error');
                        }
                    }
                } else {
                    addLog(`✅ Database is already in sync!`, 'success');
                }
                
                addLog(`📈 Total participants: ${syncData.totalParticipants}`, 'info');
                addLog(`📊 Database count: ${syncData.initialDBCount} → ${syncData.finalDBCount}`, 'info');
                addLog(`📍 Progress: ${syncData.progress}`, 'info');
                addLog(`🔄 Sync ${syncData.isComplete ? 'completed' : 'in progress'}`, syncData.isComplete ? 'success' : 'warning');
                
                // Only redirect if sync is complete and successful
                if (syncData.isComplete && syncData.count > 0) {
                    setTimeout(() => {
                        router.push('/');
                    }, 3000); // Wait 3 seconds before redirect
                }
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

    const resetAndSync = async () => {
        setIsLoading(true);
        setError(null);
        setSyncStatus(null);
        setLogs([]);

        try {
            addLog('🔄 Starting full reset and sync...', 'info');
            
            // Step 1: Reset sync state
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
            console.log(resetData);
            addLog('✅ Sync state reset successfully', 'success');

            // Step 2: Start full sync
            addLog('🚀 Starting full participant sync...', 'info');
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
                addLog(`🎉 Full sync completed successfully!`, 'success');
                addLog(`📊 Processed ${syncData.count} participants`, 'success');
                addLog(`📈 Total participants: ${syncData.totalParticipants}`, 'info');
                addLog(`📍 Progress: ${syncData.progress}`, 'info');
                
                // Redirect to home page after successful sync
                setTimeout(() => {
                    router.push('/');
                }, 2000);
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

    const getLogIcon = (type: string) => {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            default: return '📋';
        }
    };

    const getSyncTypeDisplay = (syncType: string) => {
        switch (syncType) {
            case 'NO_CHANGES': return 'No Changes';
            case 'NEW_PARTICIPANTS': return 'New Participants';
            case 'CONTINUE_SYNC': return 'Continue Sync';
            case 'MISSING_PARTICIPANTS': return 'Missing Participants';
            case 'UPDATE_CHECK': return 'Update Check';
            case 'FULL_RESYNC': return 'Full Resync';
            default: return syncType;
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
                    <p className="text-gray-600">
                        Smart sync with incremental updates. Only processes new or changed participants.
                    </p>
                </div>

                {/* Sync Buttons */}
                <div className="mb-6 flex gap-3">
                    <button
                        onClick={incrementalSync}
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
                        {isLoading ? 'Syncing...' : 'Smart Sync(Click Here)'}
                    </button>
                    
                    <button
                        onClick={resetAndSync}
                        disabled={isLoading}
                        className={`
                            flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
                            ${isLoading 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-red-600 hover:bg-red-700 active:scale-95'
                            }
                            text-white shadow-lg
                        `}
                    >
                        <RotateCcw className={isLoading ? 'animate-spin' : ''} />
                        {isLoading ? 'Resetting...' : 'Full Reset & Sync'}
                    </button>
                </div>

                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 text-blue-700 mb-1">
                            <Clock size={16} />
                            <span className="font-medium">Status</span>
                        </div>
                        <div className="text-blue-900 text-sm">
                            {isLoading ? 'Syncing...' : error ? 'Error' : syncStatus ? 'Completed' : 'Ready'}
                        </div>
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 text-green-700 mb-1">
                            <Users size={16} />
                            <span className="font-medium">Processed</span>
                        </div>
                        <div className="text-green-900 text-sm">
                            {syncStatus ? `${syncStatus.count}` : '-'}
                        </div>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-2 text-purple-700 mb-1">
                            <AlertCircle size={16} />
                            <span className="font-medium">Total</span>
                        </div>
                        <div className="text-purple-900 text-sm">
                            {syncStatus ? `${syncStatus.totalParticipants}` : '-'}
                        </div>
                    </div>

                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                        <div className="flex items-center gap-2 text-orange-700 mb-1">
                            <RefreshCw size={16} />
                            <span className="font-medium">Sync Type</span>
                        </div>
                        <div className="text-orange-900 text-sm">
                            {syncStatus ? getSyncTypeDisplay(syncStatus.syncType) : '-'}
                        </div>
                    </div>
                </div>

                {/* Detailed Stats */}
                {syncStatus && (
                    <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <div className="text-green-700 text-sm font-medium">New</div>
                            <div className="text-green-900 text-lg font-bold">{syncStatus.newParticipants}</div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="text-blue-700 text-sm font-medium">Updated</div>
                            <div className="text-blue-900 text-lg font-bold">{syncStatus.updatedParticipants}</div>
                        </div>
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                            <div className="text-yellow-700 text-sm font-medium">Skipped</div>
                            <div className="text-yellow-900 text-lg font-bold">{syncStatus.skippedParticipants}</div>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <div className="text-red-700 text-sm font-medium">Failed</div>
                            <div className="text-red-900 text-lg font-bold">{syncStatus.failedParticipants}</div>
                        </div>
                    </div>
                )}

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
                            <p>✅ Sync Type: {getSyncTypeDisplay(syncStatus.syncType)}</p>
                            <p>📊 Total processed: {syncStatus.count} participants</p>
                            <p>📈 Total participants: {syncStatus.totalParticipants}</p>
                            <p>📍 Progress: {syncStatus.progress}</p>
                            <p>💾 Database: {syncStatus.initialDBCount} → {syncStatus.finalDBCount}</p>
                            <p>⏰ Completed at: {new Date(syncStatus.timestamp).toLocaleString()}</p>
                            {syncStatus.failedUsernames && syncStatus.failedUsernames.length > 0 && (
                                <p>⚠️ Failed usernames: {syncStatus.failedUsernames.join(', ')}</p>
                            )}
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

                {/* Instructions */}
                {/* <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-medium text-blue-800 mb-2">How it works:</h3>
                    <ul className="text-blue-700 text-sm space-y-1">
                        <li><strong>Smart Sync:</strong> Only processes new or changed participants (recommended)</li>
                        <li><strong>Full Reset & Sync:</strong> Resets sync state and processes all participants from scratch</li>
                        <li>• Automatically detects new participants, missing data, and updates</li>
                        <li>• Maintains sync state to resume interrupted syncs</li>
                        <li>• Provides detailed logging and progress tracking</li>
                    </ul>
                </div> */}
            </div>
        </div>
    );
}