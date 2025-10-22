// utils/workoutParser.js

const workoutKeywords = {
  cardio: ['run', 'running', 'ran', 'jog', 'jogging', 'bike', 'biking', 'swim', 'swimming', 'row', 'rowing', 'hike', 'hiking', 'walked', 'walk'],
  strength: ['lift', 'lifting', 'lifted', 'squat', 'squats', 'deadlift', 'deadlifts', 'bench', 'press', 'curl', 'row', 'pull', 'push', 'workout', 'gym', 'weights', 'reps', 'sets', 'training', 'chest', 'back', 'legs', 'shoulders', 'arms']
};

// Question indicators - if message contains these, it's likely a question, not a log
const questionIndicators = [
  '?', 'should i', 'what do', 'how do', 'can i', 'is it', 'would it', 
  'do you think', 'advice', 'help', 'recommend', 'suggest', 'opinion',
  'supposed to', 'planning to', 'going to', 'about to', 'want to'
];

// Expanded exercise database
const exercises = [
  // Chest
  'bench press', 'bench', 'incline press', 'incline bench', 'decline press', 'decline bench',
  'chest press', 'dumbbell press', 'db press', 'cable flies', 'cable fly', 'pec flies', 'pec fly',
  'chest flies', 'chest fly', 'dips', 'push ups', 'pushups',
  
  // Back
  'deadlift', 'deadlifts', 'barbell row', 'barbell rows', 'bent over row', 'bent row',
  'dumbbell row', 'db row', 'cable row', 'seated row', 'lat pulldown', 'pulldown',
  'pull up', 'pullup', 'pull-up', 'pullups', 'chin up', 'chinup', 'chin-up',
  't-bar row', 'tbar row', 'face pulls', 'face pull',
  
  // Legs
  'squat', 'squats', 'back squat', 'front squat', 'leg press', 'leg extension',
  'leg curl', 'hamstring curl', 'calf raise', 'calf raises', 'lunges', 'lunge',
  'bulgarian split squat', 'split squat', 'romanian deadlift', 'rdl', 'leg day',
  
  // Shoulders
  'overhead press', 'ohp', 'shoulder press', 'military press', 'arnold press',
  'lateral raise', 'lateral raises', 'front raise', 'front raises', 'rear delt fly',
  'rear delt flies', 'face pull', 'shrugs', 'shrug',
  
  // Arms
  'bicep curl', 'bicep curls', 'curls', 'curl', 'hammer curl', 'hammer curls',
  'preacher curl', 'concentration curl', 'tricep extension', 'tricep extensions',
  'skull crusher', 'skull crushers', 'dips', 'close grip bench', 'tricep pushdown',
  'tricep dips',
  
  // Core
  'plank', 'planks', 'sit up', 'sit ups', 'crunches', 'crunch', 'leg raise', 'leg raises',
  'russian twist', 'russian twists', 'ab wheel', 'hanging leg raise'
];

/**
 * Parses a message to detect if it's a workout log
 * @param {string} message - The incoming WhatsApp message
 * @returns {object|null} - Workout object if detected, null otherwise
 */
function parseWorkout(message) {
  const lowerMessage = message.toLowerCase();
  
  // FILTER 1: If message contains question indicators, don't treat as workout log
  const isQuestion = questionIndicators.some(indicator => lowerMessage.includes(indicator));
  if (isQuestion) {
    return null;
  }
  
  // FILTER 2: If message is too long (>50 words), likely a question/conversation
  const wordCount = message.trim().split(/\s+/).length;
  if (wordCount > 50) {
    return null;
  }
  
  // Check if message contains workout indicators
  const hasCardioKeyword = workoutKeywords.cardio.some(keyword => lowerMessage.includes(keyword));
  const hasStrengthKeyword = workoutKeywords.strength.some(keyword => lowerMessage.includes(keyword));
  
  // Not a workout message
  if (!hasCardioKeyword && !hasStrengthKeyword) {
    return null;
  }

  // Determine workout type
  const isCardio = hasCardioKeyword && !hasStrengthKeyword;
  
  if (isCardio) {
    return parseCardioWorkout(message);
  } else {
    return parseStrengthWorkout(message);
  }
}

/**
 * Parse cardio workout (distance-based)
 */
function parseCardioWorkout(message) {
  const workout = {
    date: new Date().toISOString(),
    rawMessage: message,
    type: 'cardio',
    details: {}
  };

  // Extract distance (5K, 10K, 3 miles, etc)
  const distanceMatch = message.match(/(\d+\.?\d*)\s*(k|km|mile|miles|mi)(?!\s*hour)/i);
  if (distanceMatch) {
    workout.details.distance = parseFloat(distanceMatch[1]);
    workout.details.unit = distanceMatch[2].toLowerCase();
  }

  // Extract duration
  const durationMatch = message.match(/(?:in|took|for)\s*(\d+)\s*(min|minutes)/i);
  if (durationMatch) {
    workout.details.duration = parseInt(durationMatch[1]);
  }

  // Extract pace
  const paceMatch = message.match(/(\d+):(\d+)\s*\/\s*(km|mile|mi)/i);
  if (paceMatch) {
    workout.details.pace = `${paceMatch[1]}:${paceMatch[2]}/${paceMatch[3]}`;
  }

  return workout;
}

/**
 * Parse strength workout (multi-exercise)
 */
function parseStrengthWorkout(message) {
  const workout = {
    date: new Date().toISOString(),
    rawMessage: message,
    type: 'strength',
    exercises: []
  };

  // Split by common delimiters: commas, "then", "and", newlines
  const segments = message.split(/,|\bthen\b|\band\b|\n/i);

  for (const segment of segments) {
    const exercise = parseExerciseSegment(segment.trim());
    if (exercise) {
      workout.exercises.push(exercise);
    }
  }

  // If no exercises parsed, return null
  if (workout.exercises.length === 0) {
    return null;
  }

  return workout;
}

/**
 * Parse individual exercise segment
 * Examples: "bench 225x10 3 sets", "incline press 185 for 8 reps 3 sets"
 */
function parseExerciseSegment(segment) {
  const lowerSegment = segment.toLowerCase();
  
  // Find exercise name
  let exerciseName = null;
  for (const exercise of exercises) {
    if (lowerSegment.includes(exercise)) {
      exerciseName = exercise;
      break;
    }
  }

  if (!exerciseName) {
    return null;
  }

  const exerciseData = {
    name: exerciseName
  };

  // Extract weight and reps: "225x10", "185 for 8", "30lbs x 12"
  const weightRepsMatch = segment.match(/(\d+)\s*(lbs?|kg)?\s*(?:x|for|×)\s*(\d+)\s*(?:reps?)?/i);
  if (weightRepsMatch) {
    exerciseData.weight = parseInt(weightRepsMatch[1]);
    exerciseData.weightUnit = weightRepsMatch[2] || 'lbs';
    exerciseData.reps = parseInt(weightRepsMatch[3]);
  }

  // Extract sets: "3 sets", "4 sets"
  const setsMatch = segment.match(/(\d+)\s*sets?/i);
  if (setsMatch) {
    exerciseData.sets = parseInt(setsMatch[1]);
  }

  return exerciseData;
}

/**
 * Generate a friendly confirmation message
 * @param {object} workout - The parsed workout object
 * @returns {string} - Confirmation message
 */
function generateWorkoutConfirmation(workout) {
  if (workout.type === 'cardio') {
    let msg = '✅ Workout logged!\n\n';
    
    if (workout.details.distance) {
      msg += `Distance: ${workout.details.distance}${workout.details.unit}\n`;
    }
    if (workout.details.duration) {
      msg += `Duration: ${workout.details.duration} min\n`;
    }
    if (workout.details.pace) {
      msg += `Pace: ${workout.details.pace}\n`;
    }
    
    msg += '\nNice work 💪';
    return msg;
  } else {
    let msg = '✅ Workout logged!\n\n';
    
    // List all exercises
    if (workout.exercises.length === 1) {
      const ex = workout.exercises[0];
      msg += `Exercise: ${ex.name}\n`;
      if (ex.weight && ex.reps) {
        msg += `${ex.weight}${ex.weightUnit} × ${ex.reps} reps`;
        if (ex.sets) {
          msg += `, ${ex.sets} sets`;
        }
        msg += '\n';
      }
    } else {
      msg += `${workout.exercises.length} exercises:\n`;
      workout.exercises.forEach(ex => {
        msg += `• ${ex.name}`;
        if (ex.weight && ex.reps) {
          msg += `: ${ex.weight}${ex.weightUnit} × ${ex.reps} reps`;
          if (ex.sets) {
            msg += `, ${ex.sets} sets`;
          }
        }
        msg += '\n';
      });
    }
    
    msg += '\nStrong session 🔥';
    return msg;
  }
}

/**
 * Calculate workout streak from workout logs
 * @param {array} workouts - Array of workout objects with date field
 * @returns {number} - Current streak in days
 */
function calculateStreak(workouts) {
  if (!workouts || workouts.length === 0) return 0;

  // Sort workouts by date (newest first)
  const sortedWorkouts = workouts
    .map(w => new Date(w.date))
    .sort((a, b) => b - a);

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check consecutive days backwards from today
  for (let i = 0; i < sortedWorkouts.length; i++) {
    const workoutDate = new Date(sortedWorkouts[i]);
    workoutDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(today);
    expectedDate.setDate(today.getDate() - streak);

    if (workoutDate.getTime() === expectedDate.getTime()) {
      streak++;
    } else if (workoutDate < expectedDate) {
      break; // Gap in streak
    }
  }

  return streak;
}

module.exports = { 
  parseWorkout,
  generateWorkoutConfirmation,
  calculateStreak
};
