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
  const location = useLocation();
  const path = location.pathname;
  const isProcess = path.split("/")[-1]?.split("?")[0] === "token";
  const token = getCookie(ACCESS_TOKEN);
  const PIXEL_ID = process.env.REACT_APP_META_PIXEL_ID ?? "";

  const navigate = useNavigate();
  const setSpinner = useSetRecoilState(spinnerState);
  const setPopupOpen = useSetRecoilState(updatePopUpState);

  const [, setUserInfo] = useRecoilState(userInfoState);
  const [appStatus, setAppStatus] = useRecoilState(appStatusState);

  const [isSecurity, setIsSecurity] = useRecoilState(securityModalState);

  const { handlePushAlarmRedirect } = usePushAlarmRedirect();

  const setDeviceId = useSetRecoilState(deviceIdState);
  const isPurchaseLoading = useRecoilValue(isPurchaseLoadingState);
  const { refetch } = useUserInfoQuery(false, false);

  const { resetSubscribe } = useSubscribeContext();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const onMaintainPostMessage = (memberIdx: number) => {
    if (!memberIdx) return;
    try {
      sendReactNativeMessage({
        type: "save-token-on-device",
        payload: {
          memberIdx,
          accessToken: token,
        },
      });
    } catch (error) {
      console.log(location.pathname);
      console.log("Failed to save token");
    }
  };

  const postMessageListener = async (event: any) => {
    const path = window.location.hash;
    let postMessage;

    if (typeof event.data === "string") {
      postMessage = JSON.parse(event.data);
    } else {
      postMessage = event.data;
    }
    if (window.location.hash === "#/login") {
      const { token, type } = postMessage;
      if (token) {
        setCookie(ACCESS_TOKEN, token);

        const data = await getUserInfo().catch(() => {
          navigate("/login", { replace: true });
        });

        if (!data) {
          navigate("/login", { replace: true });
          return;
        }

        setUserInfo(data);

        const alarmData = await getMainAlarmList();

        onMaintainPostMessage(data.member_idx);

        resetSubscribe(data.member_idx);

        if (data.profile_check === 0) {
          navigate("/welcome", { replace: true });
          sendReactNativeMessage({
            controller: "sendEvent",
            service: "doc",
            payload: {
              name: "af_complete_registration",
              data: {
                af_registration_method: type,
              },
            },
          });

          track("sign_up", { join_type: type });

          return;
        }

        identifyMixpanel(String(data.member_idx));
        setAttribute({
          name: data.member_name,
        });

        const subData = await getSubscribeStatus(data.member_idx);
        const starterIsOver =
          dayjs().isAfter(dayjs(subData?.start_datetime).add(3, "day")) &&
          subData?.subscription_status === "starter";

        let subStatus;

        if (!subData) {
          subStatus = "스타터";
        } else if (subData.subscription_status === "starter") {
          subStatus = starterIsOver ? "구독 전" : "스타터";
        } else if (subData.subscription_status === "subscribed") {
          subStatus = "구독";
        } else if (subData.subscription_status === "subscription_expired") {
          subStatus = "구독 만료";
        } else {
          subStatus = "알 수 없음";
        }

        setPeople({
          type: data.member_join_type,
          gender: data.gender === 0 ? "M" : "F",
          age: Number(data.member_age) ?? 0,
          $name: data.member_name,
          diet_mode: data.diet_mode,
          $os: deviceOs === "ios" ? "iOS" : "Android",
          subscription_status: subStatus,
        });

        addTags({
          age: String(data.member_age),
          gender: data.gender === 0 ? "M" : "F",
          name: data.member_name,
          subscriptionStatus: subStatus,
        });

        if (subData === null) {
          await setUserConfig(data.member_idx, {
            subscription_status: "starter",
          });
          setAttribute({
            access_tier: "starter",
          });
          resetSubscribe();
          setTimeout(() => {
            getPlacementOfferings({ key: "starter", location: "온보딩" });
          }, 500);
        }

        if (starterIsOver) {
          setAttribute({ access_tier: "usual" });
        }
        resetSubscribe();
        navigate("/", { replace: true, state: { isNew: subData === null } });
        return;
      } else {
        setSpinner(true);
      }
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

  const getUserId = async () => {
    const userId = await new Promise<any>((resolve, reject) => {
      (window as any)?.ReactNativeWebView?.postMessage(
        JSON.stringify({
          type: "getUserId",
        })
      );

      resolveRef.current = resolve;
      rejectRef.current = reject;
    });
    return userId;
  };

  const { setPeople, identifyMixpanel, track } = useMixPanel();
  useEffect(() => {
    const fn = async () => {
      if (deviceOs === "ios") {
        window.addEventListener("message", postMessageListener);
      } else {
        document.addEventListener("message", postMessageListener);
      }

      const token = getCookie(ACCESS_TOKEN);
      deleteCookie("fcmToken");
      if (token) {
        if (
          path.split("/")[1]?.split("?")[0] === "KetoRedirect" ||
          path.split("/")[1]?.split("?")[0] === "welcome" ||
          path.split("/")[1]?.split("?")[0] === "dToken"
        ) {
          return;
        }
        (async () => {
          try {
            const data = await getUserInfo();
            const point = await getPoint(data.member_idx);
            if (data) {
              resetSubscribe(data.member_idx);
              ReactPixel.init(PIXEL_ID);
              sendReactNativeMessage({
                type: "save-token-on-device",
                payload: {
                  memberIdx: data.member_idx,
                  accessToken: token,
                },
              });
              try {
                identifyMixpanel(String(data.member_idx));
                sendReactNativeMessage({
                  controller: "ads",
                  service: "setAdsPermission",
                });

                const subData = await getSubscribeStatus(data.member_idx);
                if (subData === null) {
                  await setUserConfig(data.member_idx, {
                    subscription_status: "starter",
                  });

                  setRevenueCatAttribute({
                    access_tier: "starter",
                  });

                  setTimeout(() => {
                    resetSubscribe();
                    getRevenueCatPlacementOfferings({
                      key: "starter",
                      location: "온보딩",
                    });
                  }, 3000);
                }
                const starterIsOver =
                  dayjs().isAfter(
                    dayjs(subData?.start_datetime).add(3, "day")
                  ) && subData?.subscription_status === "starter";

                if (starterIsOver) {
                  setAttribute({ access_tier: "usual" });
                }

                let subStatus;

                if (!subData) {
                  subStatus = "스타터";
                } else if (subData.subscription_status === "starter") {
                  subStatus = starterIsOver ? "구독 전" : "스타터";
                } else if (subData.subscription_status === "subscribed") {
                  subStatus = "구독";
                } else if (
                  subData.subscription_status === "subscription_expired"
                ) {
                  subStatus = "구독 만료";
                } else {
                  subStatus = "알 수 없음";
                }

                setPeople({
                  type: data.member_join_type,
                  gender: data.gender === 0 ? "M" : "F",
                  age: Number(data.member_age) ?? 0,
                  $name: data.member_name,
                  diet_mode: data.diet_mode,
                  $os: deviceOs === "ios" ? "iOS" : "Android",
                  point_balance: point.balance,
                  subscription_status: subStatus,
                });
                setAttribute({
                  name: data.member_name,
                });
                const alarmData = await getMainAlarmList();
                addTags({
                  age: String(data.member_age),
                  gender: data.gender === 0 ? "M" : "F",
                  name: data.member_name,
                  ...alarmData,
                  subscriptionStatus: subStatus,
                });

                await postToken({
                  deviceOs,
                  permission: "Y",
                });
              } catch (err) {
                console.error("error", err);
              }
              setUserInfo(data);
              if (Date.now() >= data.token_exp - 1000 * 3600 * 24 * 180) {
                const result = await tokenReissue(String(data.member_idx));
                setCookie(ACCESS_TOKEN, result.token);
              }

              if (data.profile_check === 0) {
                navigate("/welcome");
              }
            }
          } catch (error: any) {
            if (error?.response?.status === 401) {
              deleteCookie(ACCESS_TOKEN);

              const userId = await getUserId();

              if (!userId) {
                navigate("/login", { replace: true });
                window.location.reload();
                return;
              }

              const result = await tokenReissue(userId);

              if (!result.status) {
                deleteCookie(ACCESS_TOKEN);
                navigate("/login", { replace: true });
                window.location.reload();
                return;
              } else {
                setCookie(ACCESS_TOKEN, result.token);

                setTimeout(() => {
                  window.location.reload();
                }, 3000);
              }

              return;
            }

            deleteCookie(ACCESS_TOKEN);
            navigate("/login", { replace: true });
            window.location.reload();
          }
        })();
      } else if (!isProcess && !token) {
        if (path.includes("privacy")) return;
        navigate("/login", { replace: true });
      }

      return () => {
        if (deviceOs === "ios") {
          window.removeEventListener("message", postMessageListener);
        } else {
          document.removeEventListener("message", postMessageListener);
        }
      };
    };
    fn();
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

  // eslint-disable-next-line react/jsx-no-undef
  // return <>{isLoading && <EmergencyModal />}</>;

  /**
   * 2023/01/13(금) 브라우저를 통한 해킹 의심 사건으로
   * 브라우저를 통한 루트는 모두 disable 처리
   */
  // if (isBrowser && isBrowserAccessDenied) {
  //   return <></>;
  // }

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
