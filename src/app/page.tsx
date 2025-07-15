'use client'

import React, { useState, useEffect } from 'react';
import { Users, Trophy, Plus, Minus, RotateCcw, Copy, Check, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function GolfScoringApp() {
  const [currentView, setCurrentView] = useState('home');
  const [gameCode, setGameCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [currentGame, setCurrentGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [currentHole, setCurrentHole] = useState(1);
  const [codeCopied, setCodeCopied] = useState(false);

  // Generate random game code
  const generateGameCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Set up real-time subscriptions
useEffect(() => {
  if (!currentGame?.id) return;

  // Subscribe to player changes
  const playersSubscription = supabase
    .channel('players-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'players',
      filter: `game_id=eq.${currentGame.id}`
    }, (payload) => {
      console.log('Players changed:', payload);
      fetchPlayers();
    })
    .subscribe();

  // Subscribe to score changes
  const scoresSubscription = supabase
    .channel('scores-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'scores',
      filter: `game_id=eq.${currentGame.id}`
    }, (payload) => {
      console.log('Scores changed:', payload);
      fetchScores();
    })
    .subscribe();

  return () => {
    playersSubscription.unsubscribe();
    scoresSubscription.unsubscribe();
  };
}, [currentGame?.id]); // Add dependency

  // Fetch players for current game
  const fetchPlayers = async () => {
    if (!currentGame) return;

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', currentGame.id);

    if (error) {
      console.error('Error fetching players:', error);
    } else {
      setPlayers(data);
    }
  };

  // Fetch scores for current game
  const fetchScores = async () => {
    if (!currentGame) return;

    const { data, error } = await supabase
      .from('scores')
      .select('*')
      .eq('game_id', currentGame.id);

    if (error) {
      console.error('Error fetching scores:', error);
    } else {
      // Convert scores to the format we need
      const scoresMap = {};
      players.forEach(player => {
        scoresMap[player.id] = Array(currentGame.holes).fill(0);
      });

      data.forEach(score => {
        if (scoresMap[score.player_id]) {
          scoresMap[score.player_id][score.hole - 1] = score.strokes;
        }
      });

      setScores(scoresMap);
    }
  };

  // Create new game
  const createGame = async () => {
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
      setGameCode(newGameCode);
      setCurrentView('lobby');
      
    } catch (error) {
      console.error('Error creating game:', error);
      alert(`Failed to create game: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Join existing game
  const joinGame = async () => {
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
      const { data: playerData, error: playerError } = await supabase
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
      setPlayers(allPlayers);
      setGameCode(gameData.code);
      setCurrentView('lobby');
      
    } catch (error) {
      console.error('Error joining game:', error);
      alert(`Failed to join game: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Start game
  const startGame = async () => {
    if (players.length < 1) {
      alert('Need at least 1 player to start the game');
      return;
    }
    
    // Initialize scores
    const initialScores = {};
    players.forEach(player => {
      initialScores[player.id] = Array(currentGame.holes).fill(0);
    });
    setScores(initialScores);
    setCurrentView('scoring');
  };

  // Update score
  const updateScore = async (playerId, hole, newScore) => {
    const finalScore = Math.max(0, newScore);
    
    try {
      // Update local state immediately for responsiveness
      setScores(prev => ({
        ...prev,
        [playerId]: prev[playerId].map((score, index) => 
          index === hole - 1 ? finalScore : score
        )
      }));

      // Update in Supabase
      await supabase
        .from('scores')
        .upsert({
          game_id: currentGame.id,
          player_id: playerId,
          hole: hole,
          strokes: finalScore
        });

    } catch (error) {
      console.error('Error updating score:', error);
    }
  };

  // Copy game code
  const copyGameCode = () => {
    navigator.clipboard.writeText(gameCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Get player total
  const getPlayerTotal = (playerId) => {
    return scores[playerId]?.reduce((sum, score) => sum + score, 0) || 0;
  };

  // Get leaderboard
  const getLeaderboard = () => {
    return players
      .map(player => ({
        ...player,
        total: getPlayerTotal(player.id),
        currentHole: scores[player.id]?.findIndex(score => score === 0) + 1 || currentGame?.holes + 1
      }))
      .sort((a, b) => {
        if (a.total === 0 && b.total === 0) return 0;
        if (a.total === 0) return 1;
        if (b.total === 0) return -1;
        return a.total - b.total;
      });
  };

  // Reset to home
  const resetToHome = () => {
    setCurrentView('home');
    setCurrentGame(null);
    setPlayers([]);
    setScores({});
    setGameCode('');
    setJoinCode('');
    setPlayerName('');
    setCurrentHole(1);
  };

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
              {isConnected ? (
                <Wifi size={16} className="text-green-200" />
              ) : (
                <WifiOff size={16} className="text-red-200" />
              )}
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
                    onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
                    disabled={currentHole === 1}
                    className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentHole(Math.min(currentGame.holes, currentHole + 1))}
                    disabled={currentHole === currentGame.holes}
                    className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
                  >
                    Next
                  </button>
                </div>
              </div>
              
              <div className="flex gap-1 mb-4 overflow-x-auto">
                {Array.from({ length: currentGame.holes }, (_, i) => (
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
                <div key={player.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{player.name}</h3>
                      <p className="text-gray-600">Total: {getPlayerTotal(player.id)}</p>
                    </div>
                    <div className="flex items-center gap-3">
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
                          {player.currentHole > currentGame.holes ? 'Finished' : `On hole ${player.currentHole}`}
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