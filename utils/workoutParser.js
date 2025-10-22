// utils/workoutParser.js

const workoutKeywords = {
  cardio: ['run', 'running', 'ran', 'jog', 'jogging', 'bike', 'biking', 'swim', 'swimming', 'row', 'rowing', 'hike', 'hiking', 'walked', 'walk'],
  strength: ['lift', 'lifting', 'lifted', 'squat', 'squats', 'deadlift', 'deadlifts', 'bench', 'press', 'curl', 'row', 'pull', 'push', 'workout', 'gym', 'weights', 'reps', 'sets', 'training']
};

// Question indicators - if message contains these, it's likely a question, not a log
const questionIndicators = [
  '?', 'should i', 'what do', 'how do', 'can i', 'is it', 'would it', 
  'do you think', 'advice', 'help', 'recommend', 'suggest', 'opinion',
  'supposed to', 'planning to', 'going to', 'about to', 'want to'
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
  
  // FILTER 2: If message is too long (>25 words), likely a question/conversation
  const wordCount = message.trim().split(/\s+/).length;
  if (wordCount > 25) {
    return null;
  }
  
  // Check if message contains workout indicators
  const hasCardioKeyword = workoutKeywords.cardio.some(keyword => lowerMessage.includes(keyword));
  const hasStrengthKeyword = workoutKeywords.strength.some(keyword => lowerMessage.includes(keyword));
  
  // Not a workout message
  if (!hasCardioKeyword && !hasStrengthKeyword) {
    return null;
  }

  // Base workout object
  const workout = {
    date: new Date().toISOString(),
    rawMessage: message,
    type: hasCardioKeyword ? 'cardio' : 'strength',
    details: {}
  };

  // Extract distance (5K, 10K, 3 miles, etc)
  const distanceMatch = message.match(/(\d+\.?\d*)\s*(k|km|mile|miles|mi)(?!\s*hour)/i);
  if (distanceMatch) {
    workout.details.distance = parseFloat(distanceMatch[1]);
    workout.details.unit = distanceMatch[2].toLowerCase();
  }

  // Extract duration - ONLY match workout duration, not sleep hours
  const durationMatch = message.match(/(?:in|took|for)\s*(\d+)\s*(min|minutes)/i);
  if (durationMatch) {
    workout.details.duration = parseInt(durationMatch[1]);
  }

  // Extract pace (5:24/km, 8:30/mile, etc)
  const paceMatch = message.match(/(\d+):(\d+)\s*\/\s*(km|mile|mi)/i);
  if (paceMatch) {
    workout.details.pace = `${paceMatch[1]}:${paceMatch[2]}/${paceMatch[3]}`;
  }

  // Extract weight and reps (315x5, 225 for 8 reps, 185lbs x 10, etc)
  const weightRepsMatch = message.match(/(\d+)\s*(lbs?|kg)?\s*(?:x|for|×)\s*(\d+)\s*(?:reps?)?/i);
  if (weightRepsMatch) {
    workout.details.weight = parseInt(weightRepsMatch[1]);
    workout.details.reps = parseInt(weightRepsMatch[3]);
    workout.details.weightUnit = weightRepsMatch[2] || 'lbs';
  }

  // Extract sets (3 sets, 4x, etc)
  const setsMatch = message.match(/(\d+)\s*(?:sets?)/i);
  if (setsMatch) {
    workout.details.sets = parseInt(setsMatch[1]);
  }

  // Extract exercise name
  const exercises = [
    'squat', 'squats',
    'deadlift', 'deadlifts',
    'bench press', 'bench',
    'overhead press', 'ohp',
    'barbell row', 'row', 'rows',
    'pull up', 'pullup', 'pull-up', 'pullups',
    'chin up', 'chinup', 'chin-up',
    'bicep curl', 'curls',
    'leg press',
    'lat pulldown',
    'shoulder press'
  ];
  
  for (const exercise of exercises) {
    if (lowerMessage.includes(exercise)) {
      workout.details.exercise = exercise;
      break;
    }
  }

  return workout;
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
    
    if (workout.details.exercise) {
      msg += `Exercise: ${workout.details.exercise}\n`;
    }
    if (workout.details.weight && workout.details.reps) {
      msg += `${workout.details.weight}${workout.details.weightUnit} × ${workout.details.reps} reps\n`;
    }
    if (workout.details.sets) {
      msg += `Sets: ${workout.details.sets}\n`;
    }
    
    msg += '\nStrong session 🔥';
    return msg;
  }
}

module.exports = { 
  parseWorkout,
  generateWorkoutConfirmation 
};
