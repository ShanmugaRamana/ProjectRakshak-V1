<div align="center">
  <img src="https://github.com/ShanmugaRamana/project-rakshak/blob/main/public/images/rakshak_logo.png" alt="Project Logo" width="200"><br>
  ___________________________________________________________________
  <strong><h3>BUILT WITH</h3></strong>
<br>
<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
<img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" />
<img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" />
<img src="https://img.shields.io/badge/Mongoose-880000?style=for-the-badge&logo=mongoose&logoColor=white" />
<img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" />
<img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" />
<img src="https://img.shields.io/badge/bcrypt.js-003A70?style=for-the-badge" />
<img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
<img src="https://img.shields.io/badge/ImageKit-0689D8?style=for-the-badge" />
<img src="https://img.shields.io/badge/Multer-333333?style=for-the-badge" />
<img src="https://img.shields.io/badge/EJS-3178C6?style=for-the-badge" />
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />

</div>
<br>
<div>
<h2>About The Project Rakshak Prototype</h2>
Project Rakshak is an AI-powered platform designed to enhance safety, security, and surveillance during mega events such as Ujjain Simhastha 2028.  

It addresses key issues such as:  
- 👥 Missing persons in large gatherings  



<h3>🚀 Getting Started</h3>

<ol>
  <li>
    <strong>Clone the Repository</strong>
    <pre>
git clone https://github.com/ShanmugaRamana/project-rakshak.git
cd project-rakshak
    </pre>
  </li>

  <li>
    <strong>Backend Setup (Node.js API)</strong>
    <pre>
npm install
npm run dev
    </pre>
  </li>

  <li>
    <strong>Python API (for AI models)</strong>
    <pre>
# Create virtual environment
python -m venv venv
source venv/bin/activate   # Linux/Mac
venv\Scripts\activate      # Windows
    </pre>
    <pre>
# Install dependencies
pip install -r requirements.txt
</pre>
    <pre>
# Run FastAPI server
uvicorn app.main:app --reload
    </pre>
  </li>

  <li>
    <strong>Frontend Setup (React Client)</strong>
    <pre>
cd client
npm install
npm start
    </pre>
  </li>

  <li>
    <strong>MongoDB Setup</strong>
    <p>Install MongoDB locally OR use <strong>MongoDB Atlas</strong>.</p>
    <p>Update <code>.env</code> with your connection string.</p>
  </li>

  <li>
    <strong>Environment Variables (<code>.env</code> Example)</strong>
    <pre>
PORT=5000
MONGO_URI=your_mongo_connection
JWT_SECRET=your_secret_key
IMAGEKIT_KEY=your_imagekit_config
    </pre>
  </li>

  <li>
    <strong>Run with Docker (Optional)</strong>
    <pre>
docker-compose up --build
    </pre>
  </li>
</ol>

<h3>📡 API Endpoints (Sample)</h3>

<ul>
  <li><code>POST /api/lost-person</code> → Upload image + details of missing person</li>
  <li><code>POST /api/sos</code> → Trigger emergency SOS request</li>
  <li><code>GET /api/traffic</code> → Fetch live traffic & congestion updates</li>
</ul>


</div>
