// utils/statsCalculator.js

/**
 * Calculate weekly workout statistics for insights
 */
function calculateWeeklyStats(workouts, userData) {
  if (!workouts || workouts.length === 0) {
    return {
      totalWorkouts: 0,
      noDataThisWeek: true
    };
  }

  const stats = {
    totalWorkouts: workouts.length,
    cardioCount: 0,
    strengthCount: 0,
    totalDistance: 0,
    totalDuration: 0,
    workoutDays: new Set(),
    exercises: [],
    volumeTrend: null,
    consistency: null
  };

  // Process each workout
  workouts.forEach(workout => {
    // Count by type
    if (workout.type === 'cardio') {
      stats.cardioCount++;
      if (workout.details.distance) {
        stats.totalDistance += workout.details.distance;
      }
      if (workout.details.duration) {
        stats.totalDuration += workout.details.duration;
      }
    } else if (workout.type === 'strength') {
      stats.strengthCount++;
      if (workout.details.exercise) {
        stats.exercises.push(workout.details.exercise);
      }
    }

    // Track unique workout days
    const workoutDate = new Date(workout.date);
    const dayKey = workoutDate.toISOString().split('T')[0];
    stats.workoutDays.add(dayKey);
  });

  // Calculate training balance
  stats.trainingBalance = {
    cardio: Math.round((stats.cardioCount / stats.totalWorkouts) * 100),
    strength: Math.round((stats.strengthCount / stats.totalWorkouts) * 100)
  };

  // Calculate consistency (days per week)
  stats.consistency = {
    daysActive: stats.workoutDays.size,
    frequency: stats.workoutDays.size >= 4 ? 'high' : stats.workoutDays.size >= 2 ? 'moderate' : 'low'
  };

  // Volume trend (compare to previous week if available)
  if (userData.weeklyHistory && userData.weeklyHistory.length > 0) {
    const lastWeek = userData.weeklyHistory[userData.weeklyHistory.length - 1];
    const currentVolume = stats.totalWorkouts;
    const lastVolume = lastWeek.totalVolume || 0;
    
    if (currentVolume > lastVolume) {
      stats.volumeTrend = 'increasing';
      stats.volumeChange = ((currentVolume - lastVolume) / lastVolume * 100).toFixed(0);
    } else if (currentVolume < lastVolume) {
      stats.volumeTrend = 'decreasing';
      stats.volumeChange = ((lastVolume - currentVolume) / lastVolume * 100).toFixed(0);
    } else {
      stats.volumeTrend = 'stable';
      stats.volumeChange = 0;
    }
  }

  return stats;
}

/**
 * Generate insight prompts for AI based on stats
 */
function generateInsightPrompts(stats, userData) {
  const prompts = [];

  // Volume trend insight
  if (stats.volumeTrend === 'increasing') {
    prompts.push(`Volume increased ${stats.volumeChange}% from last week - acknowledge progress`);
  } else if (stats.volumeTrend === 'decreasing') {
    prompts.push(`Volume decreased ${stats.volumeChange}% from last week - gentle reminder about consistency`);
  }

  // Training balance insight
  if (stats.trainingBalance.cardio > 80) {
    prompts.push(`Training is ${stats.trainingBalance.cardio}% cardio - suggest adding strength work`);
  } else if (stats.trainingBalance.strength > 80) {
    prompts.push(`Training is ${stats.trainingBalance.strength}% strength - suggest adding cardio for recovery`);
  } else if (stats.cardioCount > 0 && stats.strengthCount > 0) {
    prompts.push(`Good balance: ${stats.cardioCount} cardio + ${stats.strengthCount} strength sessions`);
  }

  // Consistency insight
  if (stats.consistency.daysActive >= 5) {
    prompts.push(`Trained ${stats.consistency.daysActive} days - excellent consistency`);
  } else if (stats.consistency.daysActive <= 2) {
    prompts.push(`Only ${stats.consistency.daysActive} training days - encourage more consistency`);
  }

  // Goal alignment (if user has goals)
  if (userData.goals) {
    prompts.push(`User goal: ${userData.goals} - relate insights to their goal`);
  }

  return prompts;
}

module.exports = {
  calculateWeeklyStats,
  generateInsightPrompts
};
