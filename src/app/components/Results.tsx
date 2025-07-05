type Participant = {
  _id: string;
  name: string;
  username: string;
  email: string;
  hackathon_extras: string[];
};

type ResultsProps = {
  participants: Participant[];
  searchTerm: string;
};

export default function Results({ participants, searchTerm }: ResultsProps) {
  console.log(searchTerm);
  if (!participants.length) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No participants found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4">
      {participants.map((participant) => (
        <div 
          key={participant._id} 
          className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300"
        >
          <div className="p-5">
            <div className="flex items-center space-x-3 mb-3">
              <div className="bg-blue-100 text-blue-800 rounded-full w-10 h-10 flex items-center justify-center font-bold">
                {participant.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{participant.name}</h3>
                <p className="text-sm text-gray-500">@{participant.username}</p>
              </div>
            </div>
            
            <div className="mb-4">
              <a 
                href={`mailto:${participant.email}`} 
                className="text-blue-600 hover:text-blue-800 text-sm break-all"
              >
                {participant.email}
              </a>
            </div>

            {participant.hackathon_extras.length > 0 && (
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Hackathon Extras:</h4>
                <ul className="space-y-1">
                  {participant.hackathon_extras.map((extra, i) => {
                    const isImage = extra.endsWith('.png') || extra.endsWith('.jpg') || extra.endsWith('.jpeg');
                    return (
                      <li key={i} className="text-sm text-gray-600">
                        {isImage ? (
                          <div className="relative group">
                            <div className="truncate">Image attachment</div>
                            <div className="absolute hidden group-hover:block z-10 mt-1 w-64 bg-white p-2 rounded shadow-lg border">
                              <img 
                                src={`https://api.devfolio.co/${extra}`} 
                                alt="Hackathon extra" 
                                className="max-w-full h-auto rounded"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="truncate">{extra}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}