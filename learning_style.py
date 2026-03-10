from enum import Enum
from dataclasses import dataclass
from typing import Dict, Any, List

class LearningStyleType(Enum):
    VISUAL = "visual"
    AUDITORY = "auditory"
    READING = "reading"
    KINESTHETIC = "kinesthetic"

@dataclass
class LearningStyle:
    """
    Model representing a student's learning style preferences.
    Scores can be updated over time to reflect the student's dynamic preferences.
    """
    visual_score: float = 0.0
    auditory_score: float = 0.0
    reading_score: float = 0.0
    kinesthetic_score: float = 0.0

    def get_dominant_style(self) -> LearningStyleType:
        """Determines the dominant learning style based on the highest current score."""
        scores = {
            LearningStyleType.VISUAL: self.visual_score,
            LearningStyleType.AUDITORY: self.auditory_score,
            LearningStyleType.READING: self.reading_score,
            LearningStyleType.KINESTHETIC: self.kinesthetic_score,
        }
        return max(scores, key=lambda k: scores[k])

class LearningStyleDetector:
    """
    Detects and updates learning style preferences by analyzing student behavior metrics.
    """
    
    def __init__(self, learning_style: LearningStyle):
        self.learning_style = learning_style
        
    def analyze_behavior(self, behavior_data: Dict[str, Any]) -> None:
        """
        Analyzes a single session's behavior data and updates scores accordingly.
        
        Expected keys in behavior_data:
        - time_on_animations (float): Minutes/Seconds spent on Manim animations. -> visual preference
        - requested_audio (int): Number of times the student asked for audio explanations. -> auditory
        - time_reading_summaries (float): Minutes/Seconds paused to read text summaries. -> reading
        - requested_practice (int): Number of times practice problems were requested. -> kinesthetic
        """
        # Apply weighting logic to update scores based on the specified heuristics
        animation_time = behavior_data.get("time_on_animations", 0.0)
        audio_requests = behavior_data.get("requested_audio", 0)
        reading_time = behavior_data.get("time_reading_summaries", 0.0)
        practice_requests = behavior_data.get("requested_practice", 0)
        
        # Increment scores based on engagement metrics (weights can be tuned)
        self.learning_style.visual_score += float(animation_time) * 0.1
        self.learning_style.auditory_score += int(audio_requests) * 2.0
        self.learning_style.reading_score += float(reading_time) * 0.1
        self.learning_style.kinesthetic_score += int(practice_requests) * 2.0
        
    def update_preferences_after_lesson(self, lesson_metrics: Dict[str, Any]) -> None:
        """
        Convenience method to be called after each lesson to update preferences.
        Calls analyze_behavior under the hood.
        """
        self.analyze_behavior(lesson_metrics)

class LessonAdapter:
    """
    Adapts lesson delivery instructions based on the student's dominant learning style.
    """
    
    def __init__(self, learning_style: LearningStyle):
        self.learning_style = learning_style
        
    def adapt_lesson(self, base_lesson_content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Modifies lesson delivery based on the dominant learning style.
        Returns a dictionary with specific delivery instructions.
        """
        dominant_style = self.learning_style.get_dominant_style()
        adapted_lesson = base_lesson_content.copy()
        
        if dominant_style == LearningStyleType.VISUAL:
            adapted_lesson["modifications"] = [
                "Include more Manim animations",
                "Add rich visual diagrams",
                "Use color coding for emphasis"
            ]
        elif dominant_style == LearningStyleType.AUDITORY:
            adapted_lesson["modifications"] = [
                "Provide detailed GTTS narration",
                "Use conversational verbal explanations",
                "Include audio cues for transitions"
            ]
        elif dominant_style == LearningStyleType.READING:
            adapted_lesson["modifications"] = [
                "Provide comprehensive text summaries",
                "Include full lesson transcripts",
                "Highlight key points in text"
            ]
        elif dominant_style == LearningStyleType.KINESTHETIC:
            adapted_lesson["modifications"] = [
                "Include interactive problem-solving steps",
                "Add 'try it yourself' prompts",
                "Provide hands-on exercises"
            ]
            
        adapted_lesson["delivery_mode"] = dominant_style.value
        
        return adapted_lesson
