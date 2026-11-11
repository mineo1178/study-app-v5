import { getFirestore } from "firebase/firestore";
import { auth } from "./timer-client";
import { loadReview } from "../src/review/repository";
if(location.hostname!=="127.0.0.1" || auth.app.options.projectId!=="demo-study-hotfix")throw new Error("Local demo required");
export const readReview = () => { if(!auth.currentUser)throw new Error("Login required");return loadReview(getFirestore(auth.app),"hotfix-study-family",auth.currentUser.uid); };
