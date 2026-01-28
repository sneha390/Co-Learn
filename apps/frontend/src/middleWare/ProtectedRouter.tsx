import { useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { Navigate, useParams } from "react-router-dom";

const ProtectedRouter = ({ children }: any) => {
  const user = useRecoilValue(userAtom);
  const parms = useParams();

  // For routes that already include a roomId in the URL (like /code/:roomId
  // or /learn/:roomId), allow direct access. The page components themselves
  // handle joining/initialization flows.
  if (parms.roomId) {
    return children;
  }

  const hasUser = user.id !== "" && user.roomId !== "";
  if (hasUser) {
    return children;
  }

  // Otherwise, send the user back to the root landing page.
  return <Navigate to={`/`} />;
};

export default ProtectedRouter;
