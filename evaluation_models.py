from dataclasses import dataclass, field
from typing import Dict, List, Optional

@dataclass
class StudentResult:
    """Tracks pre and post test scores for a student to measure learning gains."""
    student_id: str
    pre_test_score: float
    post_test_score: float
    
    @property
    def learning_gain(self) -> float:
        """Calculates the absolute learning gain."""
        return self.post_test_score - self.pre_test_score
    
    @property
    def normalized_learning_gain(self) -> float:
        """Calculates normalized learning gain: (post - pre) / (max - pre). Assuming max score is 100."""
        if self.pre_test_score >= 100:
            return 0.0
        return (self.post_test_score - self.pre_test_score) / (100.0 - self.pre_test_score)

@dataclass
class EngagementMetrics:
    """Tracks behavioral engagement metrics for a student session."""
    student_id: str
    time_on_task_minutes: float
    dropped_out: bool  # True if the student abandoned the lesson halfway
    returned_for_next_lesson: bool # True if they came back for a subsequent lesson
    lessons_completed: int

@dataclass
class QualitativeFeedback:
    """Stores student comments and their analyzed sentiment."""
    student_id: str
    comment: str
    sentiment_score: Optional[float] = None  # -1.0 to 1.0 (negative to positive)

@dataclass
class Experiment:
    """
    Core model for an A/B test. 
    Tracks the students assigned to each group and their corresponding metrics.
    """
    experiment_id: str
    name: str
    description: str
    treatment_group: List[str] = field(default_factory=list)
    control_group: List[str] = field(default_factory=list)
    
    # Store metrics keyed by student_id
    results: Dict[str, StudentResult] = field(default_factory=dict)
    engagement: Dict[str, EngagementMetrics] = field(default_factory=dict)
    feedback: Dict[str, QualitativeFeedback] = field(default_factory=dict)
