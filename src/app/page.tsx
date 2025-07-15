'use client'

import React, { useState, useEffect } from 'react';
import { Users, Trophy, Plus, Minus, RotateCcw, Copy, Check, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Type definitions
interface Game {
  id: string;
  code: string;
  host_name: string;
  holes: number;
  status: string;
}

interface Player {
  id: string;
  name: string;
  is_host: boolean;
  game_id?: string;
}

interface Scores {
  [playerId: string]: number[];
}

export default function GolfScoringApp() {
  const [currentView, setCurrentView] = useState<'home' | 'lobby' | 'scoring' | 'leaderboard'>('home');
  const [gameCode, setGameCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Scores>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentHole, setCurrentHole] = useState<number>(1);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Load saved game state on app start
  useEffect(() => {
    const loadSavedState = () => {
      try {
        const savedGame = localStorage.getItem('golf-current-game');
        const savedPlayer = localStorage.getItem('golf-current-player');
        const savedView = localStorage.getItem('golf-current-view');
        const savedHole = localStorage.getItem('golf-current-hole');

        if (savedGame && savedPlayer) {
          const game = JSON.parse(savedGame);
          const player = JSON.parse(savedPlayer);
          
          setCurrentGame(game);
          setCurrentPlayer(player);
          setGameCode(game.code);
          
          if (savedView) {
            setCurrentView(savedView as 'home' | 'lobby' | 'scoring' | 'leaderboard');
          }
          
          if (savedHole) {
            setCurrentHole(parseInt(savedHole));
          }

          // Fetch current players and scores
          fetchPlayersAndScores(game.id);
        }
      } catch (error) {
        console.error('Error loading saved state:', error);
        clearSavedState();
      }
      setIsInitialized(true);
    };

    loadSavedState();
  }, []);

  // Save game state whenever it changes
  useEffect(() => {
    if (!isInitialized) return;

    if (currentGame && currentPlayer) {
      localStorage.setItem('golf-current-game', JSON.stringify(currentGame));
      localStorage.setItem('golf-current-player', JSON.stringify(currentPlayer));
      localStorage.setItem('golf-current-view', currentView);
      localStorage.setItem('golf-current-hole', currentHole.toString());
    } else {
      clearSavedState();
    }
  }, [currentGame, currentPlayer, currentView, currentHole, isInitialized]);

  // Clear saved state
  const clearSavedState = () => {
    localStorage.removeItem('golf-current-game');
    localStorage.removeItem('golf-current-player');
    localStorage.removeItem('golf-current-view');
    localStorage.removeItem('golf-current-hole');
  };

  // Fetch players and scores for a game
  const fetchPlayersAndScores = async (gameId: string) => {
    try {
      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId);

      if (playersError) throw playersError;
      setPlayers(playersData || []);

      // Fetch scores
      const { data: scoresData, error: scoresError } = await supabase
        .from('scores')
        .select('*')
        .eq('game_id', gameId);

      if (scoresError) throw scoresError;

      // Convert scores to the format we need
      const scoresMap: Scores = {};
      (playersData || []).forEach(player => {
        scoresMap[player.id] = Array(currentGame?.holes || 18).fill(0);
      });

      (scoresData || []).forEach(score => {
        if (scoresMap[score.player_id]) {
          scoresMap[score.player_id][score.hole - 1] = score.strokes;
        }
      });

      setScores(scoresMap);
    } catch (error) {
      console.error('Error fetching players and scores:', error);
    }
  };

  // Generate random game code
  const generateGameCode = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Set up real-time subscriptions
  useEffect(() => {
    if (!currentGame?.id) return;

    console.log('Setting up real-time subscriptions for game:', currentGame.id);

    // Subscribe to player changes
    const playersSubscription = supabase
      .channel(`players-${currentGame.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `game_id=eq.${currentGame.id}`
      }, (payload) => {
        console.log('Players changed:', payload);
        fetchPlayersAndScores(currentGame.id);
      })
      .subscribe();

    // Subscribe to score changes
    const scoresSubscription = supabase
      .channel(`scores-${currentGame.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scores',
        filter: `game_id=eq.${currentGame.id}`
      }, (payload) => {
        console.log('Scores changed:', payload);
        fetchPlayersAndScores(currentGame.id);
      })
      .subscribe();

    return () => {
      console.log('Cleaning up subscriptions');
      playersSubscription.unsubscribe();
      scoresSubscription.unsubscribe();
    };
  }, [currentGame?.id]);

  // Separate useEffect to fetch initial data when players change
  useEffect(() => {
    if (currentGame?.id && players.length > 0) {
      fetchScoresData();
    }
  }, [currentGame?.id, players.length]);

  // Fetch just the scores (separate from players)
  const fetchScoresData = async () => {
    if (!currentGame?.id) return;

    try {
      const { data: scoresData, error: scoresError } = await supabase
        .from('scores')
        .select('*')
        .eq('game_id', currentGame.id);

      if (scoresError) throw scoresError;

      // Convert scores to the format we need
      const scoresMap: Scores = {};
      players.forEach(player => {
        scoresMap[player.id] = Array(currentGame.holes).fill(0);
      });

      (scoresData || []).forEach(score => {
        if (scoresMap[score.player_id]) {
          scoresMap[score.player_id][score.hole - 1] = score.strokes;
        }
      });

      console.log('Updated scores:', scoresMap);
      setScores(scoresMap);
    } catch (error) {
      console.error('Error fetching scores:', error);
    }
  };

  // Create new game
  const createGame = async (): Promise<void> => {
    if (!playerName.trim()) return;
    
    setIsLoading(true);
    const newGameCode = generateGameCode();
    
    try {
      // Create game in Supabase
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .insert({
          code: newGameCode,
          host_name: playerName.trim(),
          holes: 18,
          status: 'active'
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // Add host as first player
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          game_id: gameData.id,
          name: playerName.trim(),
          is_host: true
        })
        .select()
        .single();

      if (playerError) throw playerError;

      setCurrentGame(gameData);
      setPlayers([playerData]);
      setCurrentPlayer(playerData);
      setGameCode(newGameCode);
      setCurrentView('lobby');
      
    } catch (error) {
      console.error('Error creating game:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to create game: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Join existing game
  const joinGame = async (): Promise<void> => {
    if (!joinCode.trim() || !playerName.trim()) return;
    
    setIsLoading(true);
    
    try {
      // Find game by code
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', joinCode.trim().toUpperCase())
        .single();

      if (gameError || !gameData) {
        throw new Error('Game not found');
      }

      // Add player to game
      const { data: newPlayerData, error: playerError } = await supabase
        .from('players')
        .insert({
          game_id: gameData.id,
          name: playerName.trim(),
          is_host: false
        })
        .select()
        .single();

      if (playerError) throw playerError;

      // Get all players
      const { data: allPlayers, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameData.id);

      if (playersError) throw playersError;

      setCurrentGame(gameData);
      setPlayers(allPlayers || []);
      setCurrentPlayer(newPlayerData);
      setGameCode(gameData.code);
      setCurrentView('lobby');
      
    } catch (error) {
      console.error('Error joining game:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to join game: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Start game
  const startGame = async (): Promise<void> => {
    if (players.length < 1) {
      alert('Need at least 1 player to start the game');
      return;
    }
    
    // Initialize scores
    const initialScores: Scores = {};
    players.forEach(player => {
      initialScores[player.id] = Array(currentGame!.holes).fill(0);
    });
    setScores(initialScores);
    setCurrentView('scoring');
  };

  // Update score
  const updateScore = async (playerId: string, hole: number, newScore: number): Promise<void> => {
    const finalScore = Math.max(0, newScore);
    
    console.log(`Updating score for player ${playerId}, hole ${hole}, score ${finalScore}`);
    
    try {
      // Update local state immediately for responsiveness
      setScores(prev => ({
        ...prev,
        [playerId]: prev[playerId]?.map((score, index) => 
          index === hole - 1 ? finalScore : score
        ) || Array(currentGame!.holes).fill(0).map((score, index) => 
          index === hole - 1 ? finalScore : score
        )
      }));

      // Update in Supabase
      const { error } = await supabase
        .from('scores')
        .upsert({
          game_id: currentGame!.id,
          player_id: playerId,
          hole: hole,
          strokes: finalScore
        });

      if (error) {
        console.error('Supabase upsert error:', error);
        throw error;
      }

      console.log('Score updated successfully in Supabase');

    } catch (error) {
      console.error('Error updating score:', error);
      // Revert local state on error
      fetchScoresData();
    }
  };

  // Copy game code
  const copyGameCode = (): void => {
    navigator.clipboard.writeText(gameCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Get player total
  const getPlayerTotal = (playerId: string): number => {
    return scores[playerId]?.reduce((sum, score) => sum + score, 0) || 0;
  };

  // Get leaderboard
  const getLeaderboard = () => {
    if (!currentGame) return [];
    
    return players
      .map(player => ({
        ...player,
        total: getPlayerTotal(player.id),
        currentHole: scores[player.id]?.findIndex(score => score === 0) + 1 || currentGame.holes + 1
      }))
      .sort((a, b) => {
        if (a.total === 0 && b.total === 0) return 0;
        if (a.total === 0) return 1;
        if (b.total === 0) return -1;
        return a.total - b.total;
      });
  };

  // Reset to home
  const resetToHome = (): void => {
    setCurrentView('home');
    setCurrentGame(null);
    setPlayers([]);
    setScores({});
    setGameCode('');
    setJoinCode('');
    setPlayerName('');
    setCurrentHole(1);
    setCurrentPlayer(null);
    clearSavedState();
  };

  // Don't render anything until we've checked for saved state
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-green-800">Loading...</p>
        </div>
      </div>
    );
  }

  // Home screen
  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-green-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h1 className="text-3xl font-bold text-green-800 mb-8 text-center">
              Golf Scorecard
            </h1>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-3 border border-gray-300 rounded-md"
              />
            </div>

            <div className="space-y-4">
              <button
                onClick={createGame}
                disabled={!playerName.trim() || isLoading}
                className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 disabled:bg-gray-400"
              >
                {isLoading ? 'Creating Game...' : 'Create New Game'}
              </button>

              <div className="flex items-center gap-4">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="text-gray-500">or</span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter game code"
                  className="w-full p-3 border border-gray-300 rounded-md"
                />
                <button
                  onClick={joinGame}
                  disabled={!joinCode.trim() || !playerName.trim() || isLoading}
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isLoading ? 'Joining...' : 'Join Game'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby screen
  if (currentView === 'lobby') {
    return (
      <div className="min-h-screen bg-green-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h1 className="text-2xl font-bold text-green-800 mb-6 text-center">
              Game Lobby
            </h1>
            
            <div className="mb-6 text-center">
              <p className="text-gray-600 mb-2">Share this code with your friends:</p>
              <div className="flex items-center justify-center gap-2">
                <div className="bg-gray-100 px-4 py-2 rounded-lg font-mono text-2xl font-bold">
                  {gameCode}
                </div>
                <button
                  onClick={copyGameCode}
                  className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  {codeCopied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-3">Players ({players.length})</h3>
              <div className="space-y-2">
                {players.map(player => (
                  <div key={player.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                    <span className="font-medium">{player.name}</span>
                    {player.is_host && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Host
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetToHome}
                className="flex-1 bg-gray-500 text-white py-3 rounded-md hover:bg-gray-600"
              >
                Leave Game
              </button>
              <button
                onClick={startGame}
                className="flex-1 bg-green-600 text-white py-3 rounded-md hover:bg-green-700"
              >
                Start Game
              </button>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                Your game session is saved. You can safely refresh or close this page.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 pb-20">
      {/* Header */}
      <div className="bg-green-600 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold">Golf Scorecard</h1>
            <div className="flex items-center gap-2 text-sm">
              <span>Game: {gameCode}</span>
            </div>
          </div>
          <button
            onClick={resetToHome}
            className="px-4 py-2 rounded bg-red-500 hover:bg-red-600"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {/* Score Entry View */}
        {currentView === 'scoring' && (
          <div>
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Hole {currentHole}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchScoresData()}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
                    title="Refresh scores"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
                    disabled={currentHole === 1}
                    className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentHole(Math.min(currentGame!.holes, currentHole + 1))}
                    disabled={currentHole === currentGame!.holes}
                    className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
                  >
                    Next
                  </button>
                </div>
              </div>
              
              <div className="flex gap-1 mb-4 overflow-x-auto">
                {Array.from({ length: currentGame!.holes }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentHole(i + 1)}
                    className={`min-w-[40px] h-10 rounded ${
                      currentHole === i + 1 
                        ? 'bg-green-600 text-white' 
                        : 'bg-white border border-gray-300'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {players.map(player => (
                <div key={player.id} className={`bg-white rounded-lg shadow p-4 ${
                  player.id === currentPlayer?.id ? 'ring-2 ring-green-500' : ''
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{player.name}</h3>
                        {player.id === currentPlayer?.id && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600">Total: {getPlayerTotal(player.id)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {player.id === currentPlayer?.id ? (
                        // Editable controls for current player
                        <>
                          <button
                            onClick={() => updateScore(player.id, currentHole, (scores[player.id]?.[currentHole - 1] || 0) - 1)}
                            className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                          >
                            <Minus size={20} />
                          </button>
                          <span className="text-2xl font-bold w-8 text-center">
                            {scores[player.id]?.[currentHole - 1] || 0}
                          </span>
                          <button
                            onClick={() => updateScore(player.id, currentHole, (scores[player.id]?.[currentHole - 1] || 0) + 1)}
                            className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600"
                          >
                            <Plus size={20} />
                          </button>
                        </>
                      ) : (
                        // Read-only display for other players
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <Minus size={20} className="text-gray-400" />
                          </div>
                          <span className="text-2xl font-bold w-8 text-center text-gray-600">
                            {scores[player.id]?.[currentHole - 1] || 0}
                          </span>
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <Plus size={20} className="text-gray-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard View */}
        {currentView === 'leaderboard' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center">Leaderboard</h2>
            <div className="space-y-3">
              {getLeaderboard().map((player, index) => (
                <div key={player.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-yellow-500' : 
                        index === 1 ? 'bg-gray-400' : 
                        index === 2 ? 'bg-amber-600' : 'bg-gray-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{player.name}</h3>
                        <p className="text-gray-600">
                          {player.currentHole > currentGame!.holes ? 'Finished' : `On hole ${player.currentHole}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{player.total || '-'}</div>
                      <div className="text-sm text-gray-600">Total Score</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20">
        <div className="max-w-4xl mx-auto flex gap-2">
          <button
            onClick={() => setCurrentView('scoring')}
            className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-medium ${
              currentView === 'scoring' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Users size={20} />
            Scoring
          </button>
          <button
            onClick={() => setCurrentView('leaderboard')}
            className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-medium ${
              currentView === 'leaderboard' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Trophy size={20} />
            Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}