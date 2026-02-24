import os
import hashlib
import google.generativeai as genai
from dotenv import load_dotenv
import subprocess
import tempfile

load_dotenv()

# Gemini AI
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

VIDEO_DIR = os.path.join(os.path.dirname(__file__), 'videos')
os.makedirs(VIDEO_DIR, exist_ok=True)

def generate_manim_code(step_text: str, topic: str) -> str:

    model = genai.GenerativeModel('gemini-2.0-flash-exp')
    
    prompt = f"""You are a Manim animation expert. Generate Python code using the Manim library and manim-voiceover to create a short, educational animation with synchronized voiceover for this concept:

Topic: {topic}
Step: {step_text}

Requirements:
1. Use Manim Community Edition (manim library)
2. Use manim-voiceover for audio
3. Import: from manim_voiceover import VoiceoverScene
4. Import: from manim_voiceover.services.gtts import GTTSService
5. Create a Scene class called GeneratedScene that inherits from VoiceoverScene
6. In construct(), set the speech service: self.set_speech_service(GTTSService())
7. Use 'with self.voiceover(text=...) as tracker:' blocks for ALL speech sections.
8. Synchronize animations inside the voiceover blocks.
9. **Visibility Rules**:
   - Use Green (#4CAF50) for all text and labels by default.
   - If an object is also colored green, use White (#FFFFFF) for its label text to maintain visibility.
10. Keep animation under 15 seconds.
11. Return ONLY the Python code, no explanations.

Example structure:
```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class GeneratedScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        # Use Green for text
        text = Text("Example", color="#4CAF50")
        
        # If object is green, use white text
        obj = Circle(color="#4CAF50")
        label = Text("Circle", color="#FFFFFF").next_to(obj, UP)
        
        with self.voiceover(text="This is a test.") as tracker:
            self.play(Write(text))
            
        self.wait(1)
```

Generate the complete Manim code with voiceover now:"""
    
    response = model.generate_content(prompt)
    code = response.text
    
    # Clean the code (remove markdown code blocks if present)
    if '```python' in code:
        code = code.split('```python')[1].split('```')[0]
    elif '```' in code:
        code = code.split('```')[1].split('```')[0]
    
    return code.strip()

def generate_animation(step_text: str, step_number: int, topic: str) -> str:
    """Generate Manim animation and return video path"""
    
    # Create cache key
    cache_key = hashlib.md5(f"{topic}:{step_text}".encode()).hexdigest()
    video_filename = f"animation_{cache_key}.mp4"
    video_path = os.path.join(VIDEO_DIR, video_filename)
    
    # Return cached video if exists
    if os.path.exists(video_path):
        print(f"Using cached animation: {video_filename}")
        return video_path
    
    try:
        # Generate Manim code using AI
        print(f"Generating Manim code for: {step_text[:50]}...")
        manim_code = generate_manim_code(step_text, topic)
        
        # Create temporary Python file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(manim_code)
            temp_script = f.name
        
        # Render animation with Manim
        print("Rendering animation...")
        output_dir = tempfile.mkdtemp()
        
        result = subprocess.run([
            'manim',
            '-ql',  # Low quality for faster rendering
            '--format=mp4',
            f'--output_file={video_filename}',
            temp_script,
            'GeneratedScene'
        ], capture_output=True, text=True, cwd=output_dir)
        
        if result.returncode != 0:
            print(f"Manim error: {result.stderr}")
            raise Exception(f"Manim rendering failed: {result.stderr}")
        
        # Find the generated video
        media_dir = os.path.join(output_dir, 'media', 'videos')
        for root, dirs, files in os.walk(media_dir):
            for file in files:
                if file.endswith('.mp4'):
                    generated_video = os.path.join(root, file)
                    # Move to videos directory
                    os.rename(generated_video, video_path)
                    break
        
        # Cleanup
        os.unlink(temp_script)
        
        if not os.path.exists(video_path):
            raise Exception("Video file not found after rendering")
        
        print(f"Animation generated successfully: {video_filename}")
        return video_path
    
    except Exception as e:
        print(f"Error generating animation: {e}")
        raise
