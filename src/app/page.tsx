'use client';
import { useState, useEffect } from 'react';
import SearchBar from '@/app/components/SearchBar';
import Results from '@/app/components/Results';

type Participant = {
  _id: string;
  name: string;
  username: string;
  email: string;
  hackathon_extras: string[];
};

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  });

  const fetchData = async (query = '', page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/data?query=${encodeURIComponent(query)}&page=${page}&limit=${pagination.limit}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      
      setParticipants(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    fetchData(searchTerm, 1);
  };

  const handlePageChange = (newPage: number) => {
    fetchData(searchTerm, newPage);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl text-blue-600 font-bold text-center mb-2">Hackodisha Participants</h1>
        <p className="text-center text-gray-600 mb-8">Browse all registered participants</p>
        
        {/* <SearchBar 
          searchTerm={searchTerm} 
          setSearchTerm={setSearchTerm} 
          onSearch={handleSearch}
        />
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )} */}
        <SearchBar 
          searchTerm={searchTerm} 
          setSearchTerm={setSearchTerm} 
          onSearch={handleSearch}
        />

    {error && (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        {error}
      </div>
    )}

    {!error && (
      <p className="text-center text-gray-700 mb-4">
        Total Participants: {pagination.total}
      </p>
    )}


        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-gray-600">Loading participants...</p>
          </div>
        ) : (
          <>
            <Results participants={participants} searchTerm={searchTerm} />
            
            <div className="flex justify-center mt-8 gap-2">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-4 py-2 rounded ${pagination.page === page ? 'bg-blue-600 text-white' : 'bg-white border'}`}
                >
                  {page}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}