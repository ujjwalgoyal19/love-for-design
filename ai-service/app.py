from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@app.route('/generate', methods=['POST'])
def generate():
    prompt = request.json.get('prompt', '')
    try:
        completion = client.chat.completions.create(
            model='gpt-3.5-turbo',
            messages=[{'role': 'user', 'content': prompt}]
        )
        result = completion.choices[0].message.content
        return jsonify({'result': result})
    except Exception as e:
        app.logger.error(e)
        return jsonify({'error': 'Failed to generate response'}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', '3001'))
    app.run(host='0.0.0.0', port=port)
