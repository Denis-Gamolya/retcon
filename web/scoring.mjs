/** Compact vote and point rows for the current player's reveal cards. */
export function drawingScoreDetails(entry, playerId, playerName) {
  if (entry.playerId === playerId) {
    return entry.votes.map((vote) => {
      return {
        choice: vote.truth === null ? 'No vote' : vote.truth ? 'Truth' : 'Lie',
        points: vote.truth === true ? 300 : 0,
        playerName: playerName(vote.playerId),
        outcome: vote.truth === null ? '' : vote.truth
          ? entry.truth ? 'Believed' : 'Fooled'
          : entry.truth ? 'Doubted' : 'Caught',
      };
    });
  }
  const vote = entry.votes.find((candidate) => candidate.playerId === playerId);
  return [{
    choice: !vote || vote.truth === null ? 'No vote' : vote.truth ? 'Truth' : 'Lie',
    points: vote?.correct ? 500 : 0,
    playerName: null,
    outcome: !vote || vote.truth === null ? '' : vote.correct ? 'Correct' : 'Wrong',
  }];
}
