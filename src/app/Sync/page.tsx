"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Users, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw, Database } from 'lucide-react';

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
        processed: number;
        failed: number;
        failedUsernames: string[];
        totalParticipants: number;
        message: string;
        syncType?: 'INITIAL_SYNC' | 'UPDATE_CHECK' | 'MISSING_PARTICIPANTS' | 'RESYNC';
        dbCount?: number;
        apiCount?: number;
        newParticipants?: number;
    }

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev: LogEntry[]) => [...prev, { message, type, timestamp }]);
    };

    const startSync = async (syncType: 'incremental' | 'full') => {
        setIsLoading(true);
        setError(null);
        setSyncStatus(null);
        setLogs([]);

        try {
            addLog(`🔄 Starting ${syncType === 'incremental' ? 'incremental' : 'full'} sync...`, 'info');
            
            const endpoint = syncType === 'full' ? '/api/reset' : '/api/participants';
            const method = syncType === 'full' ? 'POST' : 'GET';

            // For full sync, first reset then sync
            if (syncType === 'full') {
                addLog('♻️ Resetting sync state...', 'info');
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
                addLog('✅ Sync state reset successfully', 'success');
            }

            // Perform the sync
            addLog('📡 Fetching participants data...', 'info');
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
            
            if (syncData.error) {
                throw new Error(syncData.error);
            }

            // Handle successful sync
            setSyncStatus({
                processed: syncData.processed || 0,
                failed: syncData.failed || 0,
                failedUsernames: syncData.failedUsernames || [],
                totalParticipants: syncData.totalParticipants || 0,
                message: syncData.message || 'Sync completed',
                syncType: syncData.syncType,
                dbCount: syncData.dbCount,
                apiCount: syncData.apiCount,
                newParticipants: syncData.newParticipants
            });

            // Add logs based on sync results
            addLog(`🎉 ${syncData.message}`, 'success');
            addLog(`📊 Total participants in API: ${syncData.apiCount || 'unknown'}`, 'info');
            addLog(`💾 Current database count: ${syncData.dbCount || 'unknown'}`, 'info');
            
            if (syncData.processed > 0) {
                addLog(`✅ Processed: ${syncData.processed} participants`, 'success');
            }
            
            if (syncData.failed > 0) {
                addLog(`❌ Failed: ${syncData.failed} participants`, 'error');
                if (syncData.failedUsernames?.length > 0) {
                    addLog(`⚠️ Failed usernames: ${syncData.failedUsernames.join(', ')}`, 'warning');
                }
            }

            // Redirect if significant changes were made
            if (syncData.processed > 0) {
                setTimeout(() => {
                    router.push('/');
                }, 3000);
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

    const getSyncTypeDisplay = (syncType?: string) => {
        switch (syncType) {
            case 'INITIAL_SYNC': return 'Initial Sync';
            case 'UPDATE_CHECK': return 'Update Check';
            case 'MISSING_PARTICIPANTS': return 'Missing Participants';
            case 'RESYNC': return 'Full Resync';
            default: return syncType || 'Not specified';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                        <Users className="text-blue-600" />
                        Participant Sync Dashboard
                    </h2>
                    <p className="text-gray-600">
                        Synchronize participant data between Devfolio API and local database
                    </p>
                </div>

                {/* Sync Buttons */}
                <div className="mb-6 flex gap-3 flex-wrap">
                    <button
                        onClick={() => startSync('incremental')}
                        disabled={isLoading}
                        className={`
                            flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
                            ${isLoading 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                            }
                            text-white shadow-lg flex-1 min-w-[200px]
                        `}
                    >
                        {getStatusIcon()}
                        {isLoading ? 'Syncing...' : 'Sync Participants'}
                    </button>
                    
                    <button
                        onClick={() => startSync('full')}
                        disabled={isLoading}
                        className={`
                            flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
                            ${isLoading 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-red-600 hover:bg-red-700 active:scale-95'
                            }
                            text-white shadow-lg flex-1 min-w-[200px]
                        `}
                    >
                        <RotateCcw className={isLoading ? 'animate-spin' : ''} />
                        {isLoading ? 'Resetting...' : 'Force Full Resync'}
                    </button>
                </div>

                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                            {syncStatus ? `${syncStatus.processed}` : '-'}
                        </div>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-2 text-purple-700 mb-1">
                            <Database size={16} />
                            <span className="font-medium">Total in DB</span>
                        </div>
                        <div className="text-purple-900 text-sm">
                            {syncStatus ? `${syncStatus.dbCount || 'N/A'}` : '-'}
                        </div>
                    </div>
                </div>

                {/* Detailed Stats */}
                {syncStatus && (
                    <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="text-blue-700 text-sm font-medium">API Count</div>
                            <div className="text-blue-900 text-lg font-bold">{syncStatus.apiCount || 'N/A'}</div>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <div className="text-green-700 text-sm font-medium">New</div>
                            <div className="text-green-900 text-lg font-bold">{syncStatus.newParticipants || 0}</div>
                        </div>
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                            <div className="text-yellow-700 text-sm font-medium">Sync Type</div>
                            <div className="text-yellow-900 text-lg font-bold">{getSyncTypeDisplay(syncStatus.syncType)}</div>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <div className="text-red-700 text-sm font-medium">Failed</div>
                            <div className="text-red-900 text-lg font-bold">{syncStatus.failed}</div>
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
                        {(syncStatus?.failedUsernames?.length ?? 0) > 0 && (
                            <div className="mt-2">
                                <p className="text-red-700 text-sm font-medium">Failed Participants:</p>
                                <p className="text-red-600 text-sm">{syncStatus?.failedUsernames?.join(', ')}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Success Display */}
                {syncStatus && !error && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700 mb-2">
                            <CheckCircle size={16} />
                            <span className="font-medium">Sync Results</span>
                        </div>
                        <div className="text-green-600 space-y-1">
                            <p>📋 {syncStatus.message}</p>
                            <p>📊 Processed: {syncStatus.processed} participants</p>
                            {syncStatus.newParticipants && (
                                <p>🆕 New participants: {syncStatus.newParticipants}</p>
                            )}
                            <p>📈 Total in database: {syncStatus.dbCount}</p>
                            <p>🌐 API count: {syncStatus.apiCount}</p>
                            {syncStatus.failed > 0 && (
                                <p>❌ Failed: {syncStatus.failed} participants</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Live Logs */}
                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                        <h3 className="font-medium text-gray-700 flex items-center gap-2">
                            <RefreshCw size={16} />
                            Sync Logs
                        </h3>
                    </div>
                    <div className="p-4 max-h-64 overflow-y-auto">
                        {logs.length === 0 ? (
                            <p className="text-gray-500 text-sm">No logs yet. Sync operations will appear here.</p>
                        ) : (
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
                        )}
                    </div>
                </div>

                {/* Help Section */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-medium text-blue-800 mb-2">Sync Operations:</h3>
                    <ul className="text-blue-700 text-sm space-y-1">
                        <li><strong>Sync Participants:</strong> Smart sync that only processes new or changed participants</li>
                        <li><strong>Force Full Resync:</strong> Resets sync state and processes all participants from scratch</li>
                        <li>• The system automatically detects missing participants and updates</li>
                        <li>• Failed syncs can be retried without data loss</li>
                        <li>• Detailed logs help track sync progress and issues</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}