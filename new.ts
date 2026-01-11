const useStyle = makeStyles(() =>
  createStyles({
    inoutMode: {
      position: "relative",
      width: "100vw",
      maxWidth: 428,
      height: "auto",
      minHeight: "100vh",
      margin: "auto",
      background: "#fff",
    },
    background: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "#F3F4F5",
    },
    splash: {
      position: "absolute",
      top: 0,
      zIndex: 10000,
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#fff",
    },
  })
);

const generateClassName = createGenerateClassName({
  productionPrefix: "c",
});

export const App: React.FC = () => {
  const classes = useStyle();
  const token = getCookie(ACCESS_TOKEN);

  const navigate = useNavigate();
  const setPopupOpen = useSetRecoilState(updatePopUpState);

  const [appStatus, setAppStatus] = useRecoilState(appStatusState);

  const [isSecurity, setIsSecurity] = useRecoilState(securityModalState);

  const { handlePushAlarmRedirect } = usePushAlarmRedirect();

  const setDeviceId = useSetRecoilState(deviceIdState);
  const isPurchaseLoading = useRecoilValue(isPurchaseLoadingState);
  const { refetch } = useUserInfoQuery(false, false);

  const { resetSubscribe } = useSubscribeContext();
  const queryClient = useQueryClient();

  const postMessageListener = async (event: any) => {
    const path = window.location.hash;
    let postMessage;

    if (typeof event.data === "string") {
      postMessage = JSON.parse(event.data);
    } else {
      postMessage = event.data;
    }
    if (window.location.hash === "#/login") {
    } else if (path === "#/" || path === "") {
      const { type, appState } = postMessage;
      if (type !== "push_signal") return;
      if (appStatus !== "foreground") return;
      if (deviceOs === "ios" && (!appState || appState === "background"))
        return;
    } else if (
      window.location.hash === "#/myPage/setting/alarm" ||
      window.location.hash === "#/myPage/setting/customAlarm"
    ) {
      const { permissionState, type, appState } = postMessage;

      if (appState === "background") return;
      if (type === "back-button-press") return;
      if (permissionState === "N") {
        setPopupOpen(true);
      } else {
        setPopupOpen(false);
      }
    } else if (path.includes("/battle/chat")) {
      const { appState, type } = postMessage;
      if (type === "back-button-press") return;
      if (type) {
        setAppStatus("foreground");
        return;
      }

      setAppStatus(appState);
    }
  };

  const resolveRef = useRef<((value: any) => void) | null>(null);
  const rejectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (deviceOs === "ios") {
      window.addEventListener("message", postMessageListener);
    } else {
      document.addEventListener("message", postMessageListener);
    }

    return () => {
      if (deviceOs === "ios") {
        window.removeEventListener("message", postMessageListener);
      } else {
        document.removeEventListener("message", postMessageListener);
      }
    };
  }, []);

  const refetchUserInfoQuery = async () => {
    const loginStatus = !!token;

    if (!loginStatus) {
      sendReactNativeMessage({
        type: "login-status",
        payload: JSON.stringify({
          loginStatus,
          token: "not_login",
          user: { memberIdx: "not_login" },
        }),
      });
      return;
    }

    const { data } = await refetch();
    if (!data) {
      sendReactNativeMessage({
        type: "login-status",
        payload: JSON.stringify({
          loginStatus,
          token: "not_login",
          user: { memberIdx: "not_login" },
        }),
      });
    } else {
      sendReactNativeMessage({
        type: "login-status",
        payload: JSON.stringify({ loginStatus, token, user: data }),
      });
    }
  };

  useEffect(() => {
    refetchUserInfoQuery();
  }, [token]);

  const androidBackHandlerPostMessageListener = (event: any) => {
    let message;

    if (typeof event.data === "string") {
      message = JSON.parse(event.data);
    } else {
      message = event.data;
    }

    const { type } = message;

    if (type === "back-button-press") {
      // 결제 진행 중인 경우 뒤로가기 막기

      if (isPurchaseLoading) return;
      if (window.location.hash.includes("roomEditor")) return;
      if (window.location.hash.includes("applicationForm")) return;
      if (window.location.hash.includes("certifiedForm")) return;
      if (window.location.hash.includes("/survey/progress")) return;
      if (window.location.hash === "#/" || window.location.hash === "") return;
      if (window.location.hash.includes("/search/register/write")) return;
      if (window.location.hash.includes("/search/register/picture")) return;

      navigate(-1);
    }
  };

  useEffect(() => {
    if (deviceOs === "ios") {
      window.addEventListener("message", androidBackHandlerPostMessageListener);
      return () => {
        window.removeEventListener(
          "message",
          androidBackHandlerPostMessageListener
        );
      };
    }

    document.addEventListener("message", androidBackHandlerPostMessageListener);
    return () => {
      document.removeEventListener(
        "message",
        androidBackHandlerPostMessageListener
      );
    };
  }, [isPurchaseLoading]);

  useEffect(() => {
    sendReactNativeMessage({
      type: "get-security-enabled",
    });
    sendReactNativeMessage({
      type: "get-device-id",
    });
  }, []);

  usePostMessageReceiver((event: any) => {
    let message;

    if (typeof event.data === "string") {
      message = JSON.parse(event.data);
    } else {
      message = event.data;
    }

    const { type, data } = message;

    const receiveHandler: {
      [key: string]: () => void;
    } = {
      getUserId: () => {
        resolveRef.current?.(data.userId);
        rejectRef.current?.();
      },
      "device-id": () => {
        setDeviceId(data);
      },
      "security-enabled": () => {
        const { isLock } = data;
        if (isLock) {
          setIsSecurity(true);
        }
      },
      logout: () => {
        deleteCookie(ACCESS_TOKEN);
        deleteCookie("fcmToken");
      },
      "webview-deep-link": async () => {
        const token = await getCookie(ACCESS_TOKEN);

        if (!token) {
          navigate("login", { replace: true });
          return;
        }
        setTimeout(() => {
          const currentPath = window.location.hash.replace("#", "");
          const targetPath = data.url?.startsWith("#")
            ? data.url.replace("#", "")
            : data.url;

          if (targetPath && currentPath === targetPath) return;
          if (data.url) {
            navigate(data.url);
          } else {
            navigate("/");
          }
        }, 1000);
      },
      push_signal: () => {
        if (data.head === "foreground") return;
        handlePushAlarmRedirect(data);
      },
      "offering-for-place": async () => {
        showPayWall(data);
      },
      "reset-subData": async () => {
        setIsLoading(true);
        await queryClient.resetQueries(["subscribeData"]);
        resetSubscribe();
        setTimeout(() => {
          setIsLoading(false);
        }, 3000);
      },
      default: () => {
        console.log("NOT EXIST POSTMESSAGE TYPE ", type);
      },
    };

    (receiveHandler[type] || receiveHandler["default"])();
  });

  return (
    <StylesProvider generateClassName={generateClassName}>
      <Grid className={classes.background} />
      <Grid className={classes.inoutMode}>
        <TopModal />
        <SplashModal />
        <ToastModal />
        <TimeoutModal />
        {isSecurity && (
          <SplashModalContainer>
            <SecurityModal
              onClose={() => {
                setIsSecurity(false);
              }}
            />
          </SplashModalContainer>
        )}
        <ModalsProvider>
          <Router />
        </ModalsProvider>
        <Portal>
          <SpinnerOverlayV2 open={isLoading} />
        </Portal>
      </Grid>
    </StylesProvider>
  );
};

export default App;
