import os
import sys
# Add the current directory to sys.path to ensure local imports like manim_generator work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import json
from manim_generator import generate_animation  # pyre-ignore[21]
from question_generator import QuestionGenerator  # pyre-ignore[21]
from flask import Flask, request, jsonify, send_file  # pyre-ignore[21]
from flask_cors import CORS  # pyre-ignore[21]
from dotenv import load_dotenv  # pyre-ignore[21]

load_dotenv()

app = Flask(__name__)
CORS(app)  # type: ignore

# Directory for storing rendered videos
VIDEO_DIR = os.path.join(os.path.dirname(__file__), 'videos')
os.makedirs(VIDEO_DIR, exist_ok=True)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'manim-animation'})

@app.route('/check-cache', methods=['POST'])
def check_cache():
    import hashlib
    data = request.json
    step_text = data.get('stepText')
    topic = data.get('topic', 'general')
    script = data.get('script')
    
    cache_key = hashlib.md5(f"{topic}:{step_text}:{script}".encode()).hexdigest()
    video_filename = f"animation_{cache_key}.mp4"
    video_path = os.path.join(VIDEO_DIR, video_filename)
    
    return jsonify({'exists': os.path.exists(video_path)})

@app.route('/generate-animation', methods=['POST'])
def generate_animation_endpoint():
    try:
        data = request.json
        step_text = data.get('stepText')
        step_number = data.get('stepNumber', 1)
        topic = data.get('topic', 'general')
        script = data.get('script') # Educator's script
        
        if not step_text:
            return jsonify({'error': 'stepText is required'}), 400
        
        # Generate animation (now takes script)
        video_path = generate_animation(step_text, step_number, topic, script)

        
        if not video_path or not os.path.exists(video_path):
            return jsonify({'error': 'Failed to generate animation'}), 500
        
        # Read video file and encode as base64
        with open(video_path, 'rb') as f:
            import base64
            video_base64 = base64.b64encode(f.read()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'videoBase64': video_base64,
            'videoPath': video_path
        })
    
    except Exception as e:
        print(f'Error generating animation: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/video/<filename>', methods=['GET'])
def serve_video(filename):
    video_path = os.path.join(VIDEO_DIR, filename)
    if os.path.exists(video_path):
        return send_file(video_path, mimetype='video/mp4')
    return jsonify({'error': 'Video not found'}), 404

@app.route('/generate-questions', methods=['POST'])
def generate_questions_endpoint():
    try:
        data = request.json
        lesson_content = data.get('lessonContent')
        topic_name = data.get('topic', 'General Topic')
        num_questions = data.get('numQuestions', 5)
        
        if not lesson_content:
            return jsonify({'error': 'lessonContent is required'}), 400
            
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return jsonify({'error': 'OPENAI_API_KEY not configured in Manim Service'}), 500
            
        generator = QuestionGenerator(api_key=api_key)
        questions = generator.generate_questions(
            lesson_content=lesson_content,
            topic=topic_name,
            count=num_questions
        )
        
        return jsonify({
            'success': True,
            'questions': [q.to_dict() for q in questions]
        })
        
    except Exception as e:
        print(f'Error generating questions: {e}')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('MANIM_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
