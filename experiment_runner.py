import random
import statistics
from typing import Dict, Any, List, Optional
from textblob import TextBlob
import scipy.stats as stats

from evaluation_models import Experiment, StudentResult, EngagementMetrics, QualitativeFeedback

class ExperimentRunner:
    """
    Manages A/B testing experiments, random assignment, and statistical analysis of results.
    """
    def __init__(self, experiment: Experiment):
        self.experiment = experiment
        
    def assign_student(self, student_id: str) -> str:
        """
        Randomly assigns a student to either the treatment or control group.
        If the student is already assigned, returns their existing assignment.
        """
        if student_id in self.experiment.treatment_group:
            return "treatment"
        if student_id in self.experiment.control_group:
            return "control"
            
        # Randomly assign with 50/50 probability
        group = random.choice(["treatment", "control"])
        if group == "treatment":
            self.experiment.treatment_group.append(student_id)
        else:
            self.experiment.control_group.append(student_id)
        return group
        
    def record_learning_result(self, student_id: str, pre_score: float, post_score: float) -> None:
        """Records a student's pre and post test scores."""
        self.experiment.results[student_id] = StudentResult(student_id, pre_score, post_score)
        
    def record_engagement(self, student_id: str, time_spent: float, dropped_out: bool, returned: bool, lessons: int) -> None:
        """Records engagement metrics for a student."""
        self.experiment.engagement[student_id] = EngagementMetrics(
            student_id, time_spent, dropped_out, returned, lessons
        )
        
    def record_feedback(self, student_id: str, comment: str) -> None:
        """
        Analyzes the sentiment of a student's comment and records it.
        Uses TextBlob which returns a polarity from -1.0 (very negative) to 1.0 (very positive).
        """
        blob = TextBlob(comment)
        sentiment_score = blob.sentiment.polarity
        self.experiment.feedback[student_id] = QualitativeFeedback(student_id, comment, sentiment_score)
        
    def _extract_metric(self, group: List[str], extraction_fn) -> List[float]:
        """Helper to extract a specific numerical metric for a group of students."""
        values = []
        for sid in group:
            val = extraction_fn(sid)
            if val is not None:
                values.append(val)
        return values

    def analyze_learning_gains(self) -> Dict[str, Any]:
        """Performs a T-test on the learning gains between treatment and control groups."""
        def get_gain(sid):
            if sid in self.experiment.results:
                return self.experiment.results[sid].learning_gain
            return None

        treatment_gains = self._extract_metric(self.experiment.treatment_group, get_gain)
        control_gains = self._extract_metric(self.experiment.control_group, get_gain)
        
        results: Dict[str, Any] = {
            "treatment_n": len(treatment_gains),
            "control_n": len(control_gains),
            "treatment_mean_gain": statistics.mean(treatment_gains) if treatment_gains else 0.0,
            "control_mean_gain": statistics.mean(control_gains) if control_gains else 0.0,
        }
        
        # Calculate statistical significance if we have enough data (variance requires n >= 2)
        if len(treatment_gains) >= 2 and len(control_gains) >= 2:
            t_stat, p_val = stats.ttest_ind(treatment_gains, control_gains, equal_var=False) # Welch's t-test
            results["t_statistic"] = float(t_stat)
            results["p_value"] = float(p_val)
            results["statistically_significant"] = bool(p_val < 0.05)
        else:
            results["t_statistic"] = None
            results["p_value"] = None
            results["statistically_significant"] = False
            
        return results

    def analyze_engagement(self) -> Dict[str, Any]:
        """Calculates average time on task and dropout rates for both groups."""
        def get_time(sid):
            return self.experiment.engagement[sid].time_on_task_minutes if sid in self.experiment.engagement else None
            
        def get_dropout(sid):
            return 1.0 if (sid in self.experiment.engagement and self.experiment.engagement[sid].dropped_out) else 0.0

        treatment_times = self._extract_metric(self.experiment.treatment_group, get_time)
        control_times = self._extract_metric(self.experiment.control_group, get_time)
        
        treatment_dropouts = self._extract_metric(self.experiment.treatment_group, get_dropout)
        control_dropouts = self._extract_metric(self.experiment.control_group, get_dropout)

        return {
            "treatment_avg_time_minutes": statistics.mean(treatment_times) if treatment_times else 0.0,
            "control_avg_time_minutes": statistics.mean(control_times) if control_times else 0.0,
            "treatment_dropout_rate": statistics.mean(treatment_dropouts) if treatment_dropouts else 0.0,
            "control_dropout_rate": statistics.mean(control_dropouts) if control_dropouts else 0.0,
        }

    def analyze_feedback_sentiment(self) -> Dict[str, Any]:
        """Calculates the average sentiment score for both groups."""
        def get_sentiment(sid):
            if sid in self.experiment.feedback and self.experiment.feedback[sid].sentiment_score is not None:
                return self.experiment.feedback[sid].sentiment_score
            return None
            
        treatment_sentiments = self._extract_metric(self.experiment.treatment_group, get_sentiment)
        control_sentiments = self._extract_metric(self.experiment.control_group, get_sentiment)
        
        return {
            "treatment_avg_sentiment": statistics.mean(treatment_sentiments) if treatment_sentiments else 0.0,
            "control_avg_sentiment": statistics.mean(control_sentiments) if control_sentiments else 0.0
        }
        
    def generate_full_report(self) -> Dict[str, Any]:
        """Generates a comprehensive report summarizing all experiment metrics."""
        return {
            "experiment_name": self.experiment.name,
            "learning_gains": self.analyze_learning_gains(),
            "engagement": self.analyze_engagement(),
            "feedback": self.analyze_feedback_sentiment()
        }
