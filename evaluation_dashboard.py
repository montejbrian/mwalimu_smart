import matplotlib.pyplot as plt
import io
import base64
from typing import Dict, Any

def _plot_to_base64(fig) -> str:
    """Helper function to convert a matplotlib figure to a base64 string for embedding in web/dashboards."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return f"data:image/png;base64,{img_base64}"

def generate_learning_gains_chart(report: Dict[str, Any]) -> str:
    """Generates a bar chart comparing mean learning gains between treatment and control."""
    gains_data = report.get("learning_gains", {})
    treatment = gains_data.get("treatment_mean_gain", 0)
    control = gains_data.get("control_mean_gain", 0)
    
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(['Control', 'Treatment (Adaptive AI)'], [control, treatment], color=['#cccccc', '#4CAF50'])
    
    ax.set_ylabel('Mean Learning Gain (Post - Pre)')
    ax.set_title('Learning Gains Comparison')
    
    # Add values on top of bars
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{height:.2f}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),  # 3 points vertical offset
                    textcoords="offset points",
                    ha='center', va='bottom')
                    
    return _plot_to_base64(fig)

def generate_engagement_chart(report: Dict[str, Any]) -> str:
    """Generates a grouped bar chart for engagement metrics (time on task and dropout rate)."""
    engagement_data = report.get("engagement", {})
    
    labels = ['Control', 'Treatment']
    time_on_task = [engagement_data.get("control_avg_time_minutes", 0), engagement_data.get("treatment_avg_time_minutes", 0)]
    # Scale dropout rate to percentage for better visualization alongside time
    dropout_rates = [engagement_data.get("control_dropout_rate", 0) * 100, engagement_data.get("treatment_dropout_rate", 0) * 100]

    x = range(len(labels))
    width = 0.35

    fig, ax = plt.subplots(figsize=(7, 4))
    rects1 = ax.bar([pos - width/2 for pos in x], time_on_task, width, label='Avg Time (min)', color='#2196F3')
    rects2 = ax.bar([pos + width/2 for pos in x], dropout_rates, width, label='Dropout Rate (%)', color='#F44336')

    ax.set_ylabel('Metrics')
    ax.set_title('Engagement & Retention Comparison')
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.legend()
    
    return _plot_to_base64(fig)

def generate_sentiment_chart(report: Dict[str, Any]) -> str:
    """Generates a bar chart comparing average sentiment scores."""
    feedback_data = report.get("feedback", {})
    treatment = feedback_data.get("treatment_avg_sentiment", 0)
    control = feedback_data.get("control_avg_sentiment", 0)
    
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.barh(['Control', 'Treatment'], [control, treatment], color=['#ff9800', '#9c27b0'])
    ax.set_xlabel('Sentiment Polarity (-1.0 to 1.0)')
    ax.set_title('Average Qualitative Feedback Sentiment')
    ax.set_xlim(-1.0, 1.0)
    
    return _plot_to_base64(fig)
