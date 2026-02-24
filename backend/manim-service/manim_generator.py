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

def generate_manim_code(step_text: str, topic: str, script: str = None, error_log: str = None, previous_code: str = None) -> str:
    """Manim Programmer Agent: Generates Manim code, potentially correcting previous errors."""
    
    model = genai.GenerativeModel('gemini-1.5-flash') # Using Flash for better availability and quota
    
    if error_log and previous_code:
        prompt = f"""You are a Manim Programmer Agent. Your previous attempt to generate code failed with an error. 
FIX the code based on the error log provided.

Topic: {topic}
Original Step: {step_text}
Narration Script: {script or step_text}

PREVIOUS CODE:
```python
{previous_code}
```

ERROR LOG:
{error_log}

REQUIREMENTS:
1. Fix the error identified in the log.
2. Return ONLY the complete, corrected Python code.
3. Ensure you follow all original requirements (VoiceoverScene, GTTSService, color schemes).
"""
    else:
        prompt = f"""You are a Manim Programmer Agent. Generate Python code using the Manim library and manim-voiceover to create a short, educational animation synchronized with the provided narration script.

Topic: {topic}
Step: {step_text}
Narration Script: {script or step_text}

Requirements:
1. Use Manim Community Edition (manim library)
2. Use manim-voiceover for audio (VoiceoverScene, GTTSService)
3. Create a class 'GeneratedScene' inheriting from 'VoiceoverScene'
4. Use 'with self.voiceover(text=...) as tracker:' blocks. Use the EXACT Narration Script provided above for the voiceover text.
5. Synchronize all visual animations inside the voiceover blocks.
6. **Visibility Rules**: Use Green (#4CAF50) for text/labels by default. If the background/object is green, use White (#FFFFFF).
7. Return ONLY the Python code, no explanations.

Example structure:
```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class GeneratedScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        with self.voiceover(text="The provided narration script goes here.") as tracker:
            # animations here
```
"""
    
    response = model.generate_content(prompt)
    code = response.text
    
    # Clean the code (remove markdown code blocks if present)
    if '```python' in code:
        code = code.split('```python')[1].split('```')[0]
    elif '```' in code:
        code = code.split('```')[1].split('```')[0]
    
    return code.strip()

def generate_animation(step_text: str, step_number: int, topic: str, script: str = None) -> str:
    """Generate Manim animation with a self-correction loop."""
    
    # Create cache key
    cache_key = hashlib.md5(f"{topic}:{step_text}:{script}".encode()).hexdigest()
    video_filename = f"animation_{cache_key}.mp4"
    video_path = os.path.join(VIDEO_DIR, video_filename)
    
    # Return cached video if exists
    if os.path.exists(video_path):
        print(f"Using cached animation: {video_filename}")
        return video_path
    
    max_attempts = 3
    error_log = None
    previous_code = None
    
    for attempt in range(max_attempts):
        try:
            print(f"Attempt {attempt + 1}: Generating Manim code...")
            manim_code = generate_manim_code(step_text, topic, script, error_log, previous_code)
            previous_code = manim_code
            
            # Create temporary Python file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(manim_code)
                temp_script = f.name
            
            # Render animation with Manim
            print(f"Attempt {attempt + 1}: Rendering animation...")
            output_dir = tempfile.mkdtemp()
            
            result = subprocess.run([
                'manim',
                '-ql',  # Low quality for faster rendering
                '--format=mp4',
                f'--output_file={video_filename}',
                temp_script,
                'GeneratedScene'
            ], capture_output=True, text=True, cwd=output_dir)
            
            # Cleanup script immediately
            os.unlink(temp_script)
            
            if result.returncode != 0:
                print(f"Attempt {attempt + 1} failed. Capturing error for correction...")
                error_log = result.stderr
                continue # Try next attempt with correction
            
            # Find the generated video
            media_dir = os.path.join(output_dir, 'media', 'videos')
            found_video = False
            for root, dirs, files in os.walk(media_dir):
                for file in files:
                    if file.endswith('.mp4'):
                        generated_video = os.path.join(root, file)
                        os.rename(generated_video, video_path)
                        found_video = True
                        break
                if found_video: break
            
            if not os.path.exists(video_path):
                error_log = "Video file not found after rendering process."
                continue
            
            print(f"Animation generated successfully on attempt {attempt + 1}")
            return video_path
            
        except Exception as e:
            print(f"Exception on attempt {attempt + 1}: {e}")
            error_log = str(e)
            
    raise Exception(f"Failed to generate animation after {max_attempts} attempts. Last error: {error_log}")

