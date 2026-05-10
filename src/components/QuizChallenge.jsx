import React, { useState } from 'react';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function ScoreScreen({ score, total, onRetry, onReview }) {
  const pct = score / total;
  const [grade, gradeColor] =
    pct === 1   ? ['FRACTAL_MASTER',     'var(--accent-neon)'] :
    pct >= 0.75 ? ['DIMENSION_SCHOLAR',  'var(--accent-cyan)'] :
    pct >= 0.5  ? ['ITERATION_LEARNER',  'var(--text-dim)']    :
                  ['KEEP_EXPLORING',     'var(--text-muted)'];

  return (
    <div className="quiz-score-screen">
      <div className="quiz-score-header">ASSESSMENT_COMPLETE</div>
      <div className="quiz-score-fraction">
        <span className="quiz-score-num">{score}</span>
        <span className="quiz-score-denom">/{total}</span>
      </div>
      <div className="quiz-score-grade" style={{ color: gradeColor }}>{grade}</div>
      <div className="quiz-score-actions">
        <button className="btn-tech quiz-btn-review" onClick={onReview}>
          ← REVIEW ANSWERS
        </button>
        <button className="btn-tech" onClick={onRetry}>
          ↺ RETRY
        </button>
      </div>
    </div>
  );
}

export default function QuizChallenge({ questions }) {
  const [current,   setCurrent]   = useState(0);
  const [answers,   setAnswers]   = useState(() => Array(questions.length).fill(null));
  const [highWater, setHighWater] = useState(0);
  const [done,      setDone]      = useState(false);

  const q        = questions[current];
  const selected = answers[current];
  const answered = selected !== null;
  const isCorrect = answered && selected === q.answer;
  const score = answers.reduce((acc, a, i) => acc + (a === questions[i].answer ? 1 : 0), 0);

  const handleSelect = (idx) => {
    if (answered) return;
    setAnswers(prev => { const next = [...prev]; next[current] = idx; return next; });
  };

  const handlePrev = () => {
    if (current > 0) setCurrent(c => c - 1);
  };

  const handleNext = () => {
    const next = current + 1;
    if (next >= questions.length) setDone(true);
    else {
      setCurrent(next);
      setHighWater(hw => Math.max(hw, next));
    }
  };

  const handleDotClick = (i) => {
    if (i <= highWater) setCurrent(i);
  };

  const handleRetry = () => {
    setCurrent(0);
    setAnswers(Array(questions.length).fill(null));
    setHighWater(0);
    setDone(false);
  };

  const handleReview = () => {
    setCurrent(0);
    setDone(false);
  };

  if (done) return (
    <ScoreScreen
      score={score}
      total={questions.length}
      onRetry={handleRetry}
      onReview={handleReview}
    />
  );

  const isLast     = current === questions.length - 1;
  const canGoNext  = answered || (current < highWater);

  return (
    <div className="quiz-container">
      {/* Header */}
      <div className="quiz-header">
        <span className="quiz-counter">
          CHALLENGE_{String(current + 1).padStart(2, '0')}/{String(questions.length).padStart(2, '0')}
        </span>
        <div className="quiz-dots">
          {questions.map((qq, i) => {
            const isAnswered = answers[i] !== null;
            const correct    = isAnswered && answers[i] === qq.answer;
            const wrong      = isAnswered && answers[i] !== qq.answer;
            const reachable  = i <= highWater;
            return (
              <span
                key={i}
                className={[
                  'quiz-dot',
                  i === current ? 'quiz-dot--active'  : '',
                  correct       ? 'quiz-dot--correct' : '',
                  wrong         ? 'quiz-dot--wrong'   : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleDotClick(i)}
                style={{ cursor: reachable ? 'pointer' : 'default' }}
                title={reachable ? `Challenge ${i + 1}` : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Visual area */}
      {q.visual && <div className="quiz-visual">{q.visual}</div>}

      {/* Question text */}
      <p className="quiz-question">{q.question}</p>

      {/* Options */}
      <div className="quiz-options">
        {q.options.map((opt, i) => {
          const isSelected = i === selected;
          const isAnswer   = i === q.answer;
          let mod = '';
          if (answered) {
            if (isSelected && isCorrect)  mod = 'quiz-option--correct';
            else if (isSelected)          mod = 'quiz-option--wrong';
            else if (isAnswer)            mod = 'quiz-option--reveal';
            else                          mod = 'quiz-option--dim';
          }
          return (
            <button key={i} className={`quiz-option ${mod}`} onClick={() => handleSelect(i)} disabled={answered}>
              <span className="quiz-option-letter">{LETTERS[i]}</span>
              <span className="quiz-option-text">{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {answered && (
        <div className={`quiz-explanation ${isCorrect ? 'quiz-explanation--correct' : 'quiz-explanation--wrong'}`}>
          <span className="quiz-explanation-status">
            {isCorrect ? '✓ CORRECT' : `✗ INCORRECT — correct answer: ${LETTERS[q.answer]}`}
          </span>
          {q.explanation && <p>{q.explanation}</p>}
          {q.revealVisual && <div className="quiz-reveal-visual">{q.revealVisual}</div>}
        </div>
      )}

      {/* Navigation */}
      <div className="quiz-nav">
        <button
          className="btn-tech quiz-nav-prev"
          onClick={handlePrev}
          disabled={current === 0}
        >
          ← PREV
        </button>
        <button
          className="btn-tech quiz-nav-next"
          onClick={handleNext}
          disabled={!canGoNext}
        >
          {isLast && answered ? 'FINISH_ASSESSMENT →' : 'NEXT →'}
        </button>
      </div>
    </div>
  );
}
