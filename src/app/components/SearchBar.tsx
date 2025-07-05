'use client';

type SearchBarProps = {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSearch: () => void;
};

export default function SearchBar({ searchTerm, setSearchTerm, onSearch }: SearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-8 px-4">
      <div className="relative flex gap-2">
        <input
          type="text"
          placeholder="Search by name, username, email, or hackathon extras..."
          className="flex-1 px-4 text-black py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={onSearch}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Search
        </button>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        Tip: Press Enter or click Search to find participants
      </div>
    </div>
  );
}