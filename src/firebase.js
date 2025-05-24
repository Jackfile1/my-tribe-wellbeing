import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCMIbDgdkboYIDOO5UMl1Bo_73iIQ-5Sgw",
  authDomain: "my-tribe-wellbeing.firebaseapp.com",
  projectId: "my-tribe-wellbeing",
  storageBucket: "my-tribe-wellbeing.appspot.com",
  messagingSenderId: "655598172888",
  appId: "1:655598172888:web:7c9a1b3646883e4ff275ad",
  measurementId: "G-5NNSJ301XQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Auth and Firestore instances
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;

